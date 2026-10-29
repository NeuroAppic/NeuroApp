import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_DEFAULTS, AIProviderError, getAITimeoutMs, getChatProvider } from "@/lib/ai";
import { buildTurns, HISTORY_WINDOW } from "@/lib/ai/context";
import { buildSystemPrompt } from "@/lib/ai/prompts/system-prompt";
import { fallbackSafetyReply } from "@/lib/safety/emergency";
import type { ChatMessage, ConversationStatus, RiskLevel } from "@/types/domain";
import type { ChatStreamEvent } from "./protocol";

export interface AILimits {
  user_messages_per_minute: number;
  user_messages_per_day: number;
  global_requests_per_day: number;
}

const DEFAULT_LIMITS: AILimits = {
  user_messages_per_minute: 8,
  user_messages_per_day: 300,
  global_requests_per_day: 20_000,
};

export type RateLimitResult = { ok: true } | { ok: false; scope: "minute" | "day" | "global" };

/**
 * Limite de uso baseado no banco: funciona com várias instâncias do servidor
 * (serverless) sem estado em memória. Conta mensagens da própria pessoa e
 * requisições globais à IA.
 */
export async function checkRateLimit(admin: SupabaseClient, userId: string): Promise<RateLimitResult> {
  const { data: setting } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "ai.limits")
    .maybeSingle();
  const limits = { ...DEFAULT_LIMITS, ...((setting?.value as Partial<AILimits> | undefined) ?? {}) };

  const now = Date.now();
  const minuteAgo = new Date(now - 60_000).toISOString();
  const dayAgo = new Date(now - 86_400_000).toISOString();

  const [minute, day, global] = await Promise.all([
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("sender_user_id", userId)
      .eq("sender", "user")
      .gte("created_at", minuteAgo),
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("sender_user_id", userId)
      .eq("sender", "user")
      .gte("created_at", dayAgo),
    admin.from("ai_usage").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
  ]);

  if ((minute.count ?? 0) >= limits.user_messages_per_minute) return { ok: false, scope: "minute" };
  if ((day.count ?? 0) >= limits.user_messages_per_day) return { ok: false, scope: "day" };
  if ((global.count ?? 0) >= limits.global_requests_per_day) return { ok: false, scope: "global" };
  return { ok: true };
}

interface GenerateArgs {
  admin: SupabaseClient;
  userId: string;
  conversationId: string;
  replyToId: string;
  stateVersion: number;
  status: ConversationStatus;
  riskLevel: RiskLevel;
  requestSignal: AbortSignal;
  emit: (event: ChatStreamEvent) => void;
}

/**
 * Gera e grava a resposta da IA para `replyToId`.
 * A gravação é condicionada ao estado da conversa (commit_ai_message):
 * se um profissional assumiu durante a geração, a resposta é descartada.
 */
export async function generateAIReply(args: GenerateArgs): Promise<void> {
  const { admin, userId, conversationId, emit } = args;
  const started = Date.now();
  let providerName = "unconfigured";
  let modelName = "unconfigured";

  const timeout = AbortSignal.timeout(getAITimeoutMs());
  const signal = AbortSignal.any([args.requestSignal, timeout]);

  try {
    const provider = getChatProvider();
    providerName = provider.name;
    modelName = provider.model;

    const [history, prefs, profile, available] = await Promise.all([
      admin
        .from("messages")
        .select("id, conversation_id, sender, sender_label, content, client_message_id, input_source, reply_to_id, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(HISTORY_WINDOW),
      admin
        .from("user_preferences")
        .select("short_answers, literal_communication")
        .eq("user_id", userId)
        .maybeSingle(),
      admin.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
      admin.rpc("available_clinicians_count"),
    ]);
    if (history.error) throw history.error;

    const turns = buildTurns(((history.data ?? []) as ChatMessage[]).reverse());
    const system = buildSystemPrompt({
      status: args.status,
      riskLevel: args.riskLevel,
      shortAnswers: Boolean(prefs.data?.short_answers),
      literalCommunication: Boolean(prefs.data?.literal_communication),
      nickname: (profile.data?.display_name as string | null | undefined) ?? null,
      humanRequestPending: args.status === "waiting_human",
      availableProfessionals: typeof available.data === "number" ? available.data : 0,
    });

    emit({ type: "ai_start", simulated: provider.isSimulated });

    let text = "";
    let usage = { inputTokens: 0, outputTokens: 0 };
    for await (const event of provider.stream({
      system,
      turns,
      maxOutputTokens: AI_DEFAULTS.maxOutputTokens,
      signal,
    })) {
      if (event.type === "text") {
        text += event.text;
        emit({ type: "delta", text: event.text });
      } else {
        usage = event.usage;
        modelName = event.model;
      }
    }

    text = text.trim();
    if (!text) throw new AIProviderError("Resposta vazia.", "unavailable");

    const { data: committed, error } = await admin.rpc("commit_ai_message", {
      p_conversation_id: conversationId,
      p_expected_version: args.stateVersion,
      p_reply_to: args.replyToId,
      p_content: text.slice(0, 4000),
      p_provider: providerName,
      p_model: modelName,
    });
    if (error) throw error;

    await logUsage(admin, {
      userId,
      conversationId,
      provider: providerName,
      model: modelName,
      usage,
      latencyMs: Date.now() - started,
      outcome: committed ? "ok" : "discarded",
    });

    if (committed) emit({ type: "ai_message", message: committed as ChatMessage });
    else emit({ type: "discarded", reason: "state_changed" });
  } catch (error) {
    const kind = error instanceof AIProviderError ? error.kind : "unavailable";
    // A pessoa saiu ou enviou outra mensagem: não é falha do provedor.
    const cancelledByClient = args.requestSignal.aborted;
    if (!cancelledByClient) {
      // Log técnico sem conteúdo da conversa.
      console.error("[chat] falha na IA", { conversationId, provider: providerName, kind });
    }
    await logUsage(admin, {
      userId,
      conversationId,
      provider: providerName,
      model: modelName,
      usage: { inputTokens: 0, outputTokens: 0 },
      latencyMs: Date.now() - started,
      outcome: cancelledByClient
        ? "discarded"
        : kind === "timeout"
          ? "timeout"
          : kind === "rate_limited"
            ? "rate_limited"
            : "error",
    });
    if (cancelledByClient) return;
    emit({
      type: "ai_unavailable",
      fallbackText: fallbackSafetyReply(args.riskLevel),
      retryable: kind !== "config",
    });
  }
}

async function logUsage(
  admin: SupabaseClient,
  entry: {
    userId: string;
    conversationId: string;
    provider: string;
    model: string;
    usage: { inputTokens: number; outputTokens: number };
    latencyMs: number;
    outcome: "ok" | "error" | "timeout" | "discarded" | "rate_limited";
  },
): Promise<void> {
  const { error } = await admin.from("ai_usage").insert({
    user_id: entry.userId,
    conversation_id: entry.conversationId,
    provider: entry.provider,
    model: entry.model,
    input_tokens: entry.usage.inputTokens,
    output_tokens: entry.usage.outputTokens,
    latency_ms: entry.latencyMs,
    outcome: entry.outcome,
  });
  if (error) console.error("[chat] falha ao registrar uso da IA", { code: error.code });
}
