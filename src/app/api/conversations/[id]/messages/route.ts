import type { NextRequest } from "next/server";
import { generateAIReply, checkRateLimit } from "@/lib/chat/service";
import { encodeEvent, type ChatStreamEvent } from "@/lib/chat/protocol";
import { assertSameOrigin, jsonError, mapDbError } from "@/lib/http";
import { assessRisk, isElevatedRisk } from "@/lib/safety/risk-classifier";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";
import { postMessageSchema, uuidParamSchema } from "@/lib/validation/schemas";
import type { ChatMessage, ConversationStatus } from "@/types/domain";

export const maxDuration = 60;

/**
 * Envia uma mensagem da pessoa e transmite a resposta da IA (NDJSON).
 *
 * Garantias:
 *  - A mensagem é gravada ANTES de chamar a IA: falhas da IA nunca perdem o que foi escrito.
 *  - Idempotente por clientMessageId (reenvios não duplicam).
 *  - O risco é classificado no servidor; o cliente não pode forjá-lo.
 *  - A IA não responde se um profissional estiver na conversa, e a resposta é
 *    descartada se o estado mudar durante a geração.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/conversations/[id]/messages">) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  const { id } = await ctx.params;
  const conversationId = uuidParamSchema.safeParse(id);
  if (!conversationId.success) return jsonError(404, "conversation_not_found", "Conversa não encontrada.");

  const body = postMessageSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return jsonError(400, "invalid_message", body.error.issues[0]?.message ?? "Mensagem inválida.");
  }

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return jsonError(401, "unauthenticated", "Sessão não encontrada.");
  const userId = auth.user.id;

  const admin = getAdminSupabase();
  const limit = await checkRateLimit(admin, userId);
  if (!limit.ok) {
    return jsonError(
      429,
      "rate_limited",
      limit.scope === "minute"
        ? "Muitas mensagens em pouco tempo. Respire um pouco e tente de novo em instantes."
        : "O limite de uso foi atingido por agora. Os contatos de ajuda continuam disponíveis.",
    );
  }

  const risk = assessRisk(body.data.content);
  const { data: posted, error } = await admin.rpc("post_user_message", {
    p_user_id: userId,
    p_conversation_id: conversationId.data,
    p_content: body.data.content,
    p_client_message_id: body.data.clientMessageId,
    p_input_source: body.data.source,
    p_risk_level: risk.level,
    p_risk_rules: risk.ruleIds,
  });
  if (error) return mapDbError(error);

  const result = posted as {
    message: ChatMessage;
    status: ConversationStatus;
    state_version: number;
    escalated: boolean;
    duplicate: boolean;
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ChatStreamEvent) => {
        try {
          controller.enqueue(encodeEvent(event));
        } catch {
          // conexão fechada pelo cliente
        }
      };

      emit({
        type: "user_message",
        message: result.message,
        status: result.status,
        stateVersion: result.state_version,
        duplicate: result.duplicate,
      });

      if (isElevatedRisk(risk.level)) {
        const { data: available } = await admin.rpc("available_clinicians_count");
        emit({
          type: "safety",
          level: risk.level,
          escalated: result.escalated,
          availableProfessionals: typeof available === "number" ? available : 0,
        });
      }

      if (result.status === "human_active") {
        emit({ type: "ai_skipped", reason: "human_active" });
      } else if (result.duplicate && (await hasAIReply(conversationId.data, result.message.id))) {
        emit({ type: "ai_skipped", reason: "already_answered" });
      } else {
        await generateAIReply({
          admin,
          userId,
          conversationId: conversationId.data,
          replyToId: result.message.id,
          stateVersion: result.state_version,
          status: result.status,
          riskLevel: risk.level,
          requestSignal: request.signal,
          emit,
        });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

  async function hasAIReply(convId: string, messageId: string): Promise<boolean> {
    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", convId)
      .eq("reply_to_id", messageId);
    return (count ?? 0) > 0;
  }
}
