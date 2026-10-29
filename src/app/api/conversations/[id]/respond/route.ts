import type { NextRequest } from "next/server";
import { generateAIReply } from "@/lib/chat/service";
import { encodeEvent, type ChatStreamEvent } from "@/lib/chat/protocol";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { maxRiskLevel } from "@/lib/safety/risk-classifier";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";
import { uuidParamSchema } from "@/lib/validation/schemas";
import type { ConversationStatus, RiskLevel } from "@/types/domain";

export const maxDuration = 60;

/**
 * "Tentar de novo": gera a resposta da IA para a última mensagem da pessoa
 * que ainda não foi respondida (após falha ou indisponibilidade da IA).
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/conversations/[id]/respond">) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  const { id } = await ctx.params;
  const parsedId = uuidParamSchema.safeParse(id);
  if (!parsedId.success) return jsonError(404, "conversation_not_found", "Conversa não encontrada.");
  const conversationId = parsedId.data;

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return jsonError(401, "unauthenticated", "Sessão não encontrada.");

  // Leitura com a sessão da pessoa: o RLS garante que a conversa é dela.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, status, state_version, user_id")
    .eq("id", conversationId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!conversation) return jsonError(404, "conversation_not_found", "Conversa não encontrada.");

  const status = conversation.status as ConversationStatus;
  if (status !== "ai_active" && status !== "waiting_human") {
    return jsonError(409, "ai_not_available", "O assistente não responde nesta etapa da conversa.");
  }

  const admin = getAdminSupabase();
  const { data: last } = await admin
    .from("messages")
    .select("id, sender, risk_level")
    .eq("conversation_id", conversationId)
    .in("sender", ["user", "ai"])
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last || last.sender !== "user") {
    return jsonError(409, "nothing_to_answer", "Não há mensagem aguardando resposta.");
  }

  const { data: convRisk } = await admin
    .from("conversations")
    .select("risk_level")
    .eq("id", conversationId)
    .single();
  const riskLevel = maxRiskLevel(
    (last.risk_level as RiskLevel | null) ?? "none",
    (convRisk?.risk_level as RiskLevel | undefined) ?? "none",
  );

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ChatStreamEvent) => {
        try {
          controller.enqueue(encodeEvent(event));
        } catch {
          // conexão fechada
        }
      };
      await generateAIReply({
        admin,
        userId: auth.user.id,
        conversationId,
        replyToId: last.id as string,
        stateVersion: conversation.state_version as number,
        status,
        riskLevel,
        requestSignal: request.signal,
        emit,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
