"use client";

import { useCallback, useEffect, useState } from "react";
import { sortMessages, upsertMessage } from "@/features/chat/chat-state";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { ChatMessage, ConversationStatus, RiskLevel } from "@/types/domain";

export interface StaffConversationDetail {
  conversation: {
    id: string;
    status: ConversationStatus;
    state_version: number;
    assigned_staff_id: string | null;
    assigned_label: string | null;
    risk_level: RiskLevel;
    priority: boolean;
    legal_hold: boolean;
    created_at: string;
  };
  messages: (ChatMessage & { risk_level?: RiskLevel | null })[];
  person: { display_name?: string | null; since?: string };
  preferences: { short_answers: boolean; literal_communication: boolean; low_stimulus: boolean } | null;
  assignments: { staff_label: string | null; assigned_at: string; released_at: string | null; release_reason: string | null }[];
}

const ERRORS: Record<string, string> = {
  already_claimed: "Outro profissional já assumiu esta conversa.",
  not_claimable: "Esta conversa não está disponível para assumir.",
  not_assigned: "Você não é o responsável por esta conversa.",
  forbidden: "Você não tem permissão para esta ação.",
  invalid_target: "Escolha outro profissional habilitado.",
};

function friendly(message: string | undefined): string {
  const key = Object.keys(ERRORS).find((k) => message?.includes(k));
  return key ? ERRORS[key]! : "Algo não funcionou. Tente novamente.";
}

/**
 * Conversa aberta no painel. A leitura passa por get_conversation_for_staff
 * (auditada); novas mensagens e mudanças de estado chegam pelo canal privado.
 */
export function useStaffConversation(conversationId: string | null, canReadContent: boolean) {
  const [detail, setDetail] = useState<StaffConversationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!conversationId || !canReadContent) return;
    const { data, error: rpcError } = await getBrowserSupabase().rpc("get_conversation_for_staff", {
      p_conversation_id: conversationId,
    });
    if (rpcError) {
      setError(friendly(rpcError.message));
      setDetail(null);
      return;
    }
    const d = data as StaffConversationDetail;
    setDetail({ ...d, messages: sortMessages(d.messages) });
    setError(null);
  }, [conversationId, canReadContent]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- troca de conversa selecionada
    setDetail(null);
    void load();
  }, [load]);

  useEffect(() => {
    if (!conversationId || !canReadContent) return;
    const supabase = getBrowserSupabase();
    let disposed = false;
    let wasLive = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      await supabase.realtime.setAuth();
      if (disposed) return;
      channel = supabase
        .channel(`conversation:${conversationId}`, { config: { private: true } })
        .on("broadcast", { event: "message_created" }, ({ payload }) => {
          const message = (payload as { message: ChatMessage }).message;
          setDetail((d) => (d ? { ...d, messages: upsertMessage(d.messages, message) } : d));
        })
        .on("broadcast", { event: "conversation_updated" }, ({ payload }) => {
          const p = payload as { status: ConversationStatus; state_version: number; assigned_label: string | null };
          setDetail((d) =>
            d && p.state_version >= d.conversation.state_version
              ? { ...d, conversation: { ...d.conversation, ...p } }
              : d,
          );
          // Responsável pode ter mudado: recarrega metadados completos.
          void load();
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            if (wasLive) void load();
            wasLive = true;
          }
        });
    })();
    return () => {
      disposed = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [conversationId, canReadContent, load]);

  const run = useCallback(
    async (fn: string, args: Record<string, unknown>) => {
      if (!conversationId) return false;
      setBusy(true);
      setError(null);
      const { error: rpcError } = await getBrowserSupabase().rpc(fn, { p_conversation_id: conversationId, ...args });
      setBusy(false);
      if (rpcError) {
        setError(friendly(rpcError.message));
        return false;
      }
      await load();
      return true;
    },
    [conversationId, load],
  );

  return {
    detail,
    error,
    busy,
    claim: () => run("claim_conversation", {}),
    send: (content: string) => run("post_staff_message", { p_content: content, p_client_message_id: crypto.randomUUID() }),
    close: () => run("close_conversation", {}),
    releaseToAI: () => run("release_to_ai", {}),
    transfer: (toStaff: string) => run("transfer_conversation", { p_to_staff: toStaff }),
    setLegalHold: (hold: boolean, reason: string) => run("set_legal_hold", { p_hold: hold, p_reason: reason }),
  };
}
