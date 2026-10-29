"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from "react";
import { readEventStream, type ChatStreamEvent } from "@/lib/chat/protocol";
import { CHAT_POLICY_VERSION } from "@/lib/legal";
import { syncPreferencesToAccount } from "@/lib/preferences/preferences-provider";
import { ensureVisitorSession, getBrowserSupabase } from "@/lib/supabase/client";
import type {
  ChatMessage,
  ConversationStatus,
  MessageInputSource,
  RiskLevel,
} from "@/types/domain";
import { chatReducer, initialChatState, type ChatState } from "./chat-state";

const MESSAGE_COLUMNS =
  "id, conversation_id, sender, sender_label, content, client_message_id, input_source, reply_to_id, created_at";

export interface UseChat {
  state: ChatState;
  begin: () => Promise<void>;
  send: (content: string, source?: MessageInputSource) => Promise<void>;
  retryMessage: (clientId: string) => Promise<void>;
  retryAI: () => Promise<void>;
  requestHuman: () => Promise<void>;
  cancelHumanRequest: () => Promise<void>;
  closeConversation: () => Promise<void>;
  startNew: () => void;
  dismissSafety: () => void;
}

/**
 * Estado e efeitos do chat da pessoa:
 *  - envio com streaming (NDJSON) e idempotência por clientMessageId;
 *  - Realtime em canal privado `conversation:<id>` (mensagens de profissionais,
 *    mudanças de estado); ao reconectar, recarrega o histórico do banco para
 *    não perder nada que chegou durante a queda;
 *  - quando um profissional assume, a geração da IA em andamento é cancelada.
 */
export function useChat(): UseChat {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const abortRef = useRef<AbortController | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  });

  const loadConversation = useCallback(async (conversationId: string) => {
    const supabase = getBrowserSupabase();
    const [{ data: conversation, error }, { data: messages }] = await Promise.all([
      supabase
        .from("conversations")
        .select("id, status, state_version, assigned_label, risk_level")
        .eq("id", conversationId)
        .single(),
      supabase
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(500),
    ]);
    if (error || !conversation) throw new Error("conversation_not_found");
    dispatch({
      type: "loaded",
      conversationId,
      status: conversation.status as ConversationStatus,
      stateVersion: conversation.state_version as number,
      assignedLabel: (conversation.assigned_label as string | null) ?? null,
      riskLevel: conversation.risk_level as RiskLevel,
      messages: (messages ?? []) as ChatMessage[],
    });
  }, []);

  // --- Retomada: se já existe sessão e conversa ativa, abre direto. ---------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getBrowserSupabase();
        const { data } = await supabase.auth.getUser();
        if (!data.user) {
          if (!cancelled) dispatch({ type: "needs_consent" });
          return;
        }
        const { data: active } = await supabase
          .from("conversations")
          .select("id")
          .eq("user_id", data.user.id)
          .in("status", ["ai_active", "waiting_human", "human_active"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        if (active) await loadConversation(active.id as string);
        else dispatch({ type: "needs_consent" });
      } catch {
        if (!cancelled) dispatch({ type: "unavailable" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadConversation]);

  // --- Realtime -----------------------------------------------------------
  const conversationId = state.conversationId;
  useEffect(() => {
    if (!conversationId) return;
    const supabase = getBrowserSupabase();
    let disposed = false;
    let hadConnection = false;

    (async () => {
      await supabase.realtime.setAuth();
      if (disposed) return;
      const channel = supabase
        .channel(`conversation:${conversationId}`, { config: { private: true } })
        .on("broadcast", { event: "message_created" }, ({ payload }) => {
          const message = (payload as { message: ChatMessage }).message;
          dispatch({ type: "message_received", message });
        })
        .on("broadcast", { event: "conversation_updated" }, ({ payload }) => {
          const p = payload as {
            status: ConversationStatus;
            state_version: number;
            assigned_label: string | null;
          };
          if (p.status === "human_active" || p.status === "closed" || p.status === "archived") {
            // A IA não pode mais responder: cancela a geração em andamento.
            abortRef.current?.abort();
          }
          dispatch({
            type: "status_changed",
            status: p.status,
            stateVersion: p.state_version,
            assignedLabel: p.assigned_label,
          });
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            dispatch({ type: "connection", value: "live" });
            // Após uma queda, busca o que pode ter chegado nesse intervalo.
            if (hadConnection) void loadConversation(conversationId).catch(() => undefined);
            hadConnection = true;
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            dispatch({ type: "connection", value: "reconnecting" });
          } else if (status === "CLOSED" && !disposed) {
            dispatch({ type: "connection", value: "reconnecting" });
          }
        });
      channelRef.current = channel;
    })();

    const onOnline = () => void loadConversation(conversationId).catch(() => undefined);
    const onOffline = () => dispatch({ type: "connection", value: "offline" });
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      disposed = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (channelRef.current) void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [conversationId, loadConversation]);

  // --- Streaming ------------------------------------------------------------
  const handleEvent = useCallback((event: ChatStreamEvent) => {
    dispatch({ type: "stream_event", event });
  }, []);

  const runStream = useCallback(
    async (url: string, body: unknown, clientId: string | null) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          const err = (await response.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          const message = err?.error?.message ?? "Não foi possível enviar. Tente novamente.";
          if (clientId) dispatch({ type: "send_failed", clientId, error: message });
          else dispatch({ type: "notice", message });
          return;
        }
        await readEventStream(response.body, handleEvent);
      } catch {
        if (controller.signal.aborted) {
          dispatch({ type: "ai_cancelled" });
          return;
        }
        // Falha de rede: a mensagem pode ou não ter sido gravada. Reenviar é
        // seguro (mesmo clientMessageId → sem duplicação).
        if (clientId) {
          dispatch({ type: "send_failed", clientId, error: "Sem conexão. Sua mensagem não foi perdida: toque para reenviar." });
        } else {
          dispatch({ type: "notice", message: "Sem conexão no momento." });
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [handleEvent],
  );

  const sendWithId = useCallback(
    async (clientId: string, content: string, source: MessageInputSource) => {
      const id = stateRef.current.conversationId;
      if (!id) return;
      dispatch({ type: "sending", clientId, content, source });
      await runStream(
        `/api/conversations/${id}/messages`,
        { content, clientMessageId: clientId, source },
        clientId,
      );
    },
    [runStream],
  );

  const send = useCallback(
    (content: string, source: MessageInputSource = "typed") =>
      sendWithId(crypto.randomUUID(), content, source),
    [sendWithId],
  );

  const retryMessage = useCallback(
    async (clientId: string) => {
      const pending = stateRef.current.pending.find((p) => p.clientId === clientId);
      if (pending) await sendWithId(clientId, pending.content, pending.source);
    },
    [sendWithId],
  );

  const retryAI = useCallback(async () => {
    const id = stateRef.current.conversationId;
    if (!id) return;
    dispatch({ type: "retrying_ai" });
    await runStream(`/api/conversations/${id}/respond`, {}, null);
  }, [runStream]);

  const begin = useCallback(async () => {
    dispatch({ type: "starting" });
    try {
      await ensureVisitorSession();
      void syncPreferencesToAccount();
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptedPolicyVersion: CHAT_POLICY_VERSION }),
      });
      if (!response.ok) throw new Error("start_failed");
      const { conversationId: id } = (await response.json()) as { conversationId: string };
      await loadConversation(id);
    } catch {
      dispatch({ type: "start_failed" });
    }
  }, [loadConversation]);

  const rpc = useCallback(async (fn: string) => {
    const id = stateRef.current.conversationId;
    if (!id) return null;
    const { data, error } = await getBrowserSupabase().rpc(fn, { p_conversation_id: id });
    if (error) {
      dispatch({ type: "notice", message: "Não foi possível concluir agora. Tente novamente." });
      return null;
    }
    return data as Record<string, unknown>;
  }, []);

  const requestHuman = useCallback(async () => {
    const result = await rpc("request_human");
    if (!result) return;
    dispatch({
      type: "human_requested",
      status: result.status as ConversationStatus,
      stateVersion: result.state_version as number,
      availableProfessionals: Number(result.available_professionals ?? 0),
    });
  }, [rpc]);

  const cancelHumanRequest = useCallback(async () => {
    const result = await rpc("cancel_human_request");
    if (result) {
      dispatch({
        type: "status_changed",
        status: result.status as ConversationStatus,
        stateVersion: result.state_version as number,
        assignedLabel: null,
      });
    }
  }, [rpc]);

  const closeConversation = useCallback(async () => {
    abortRef.current?.abort();
    const result = await rpc("close_conversation");
    if (result) {
      dispatch({
        type: "status_changed",
        status: result.status as ConversationStatus,
        stateVersion: result.state_version as number,
        assignedLabel: null,
      });
    }
  }, [rpc]);

  const startNew = useCallback(() => dispatch({ type: "needs_consent" }), []);
  const dismissSafety = useCallback(() => dispatch({ type: "dismiss_safety" }), []);

  // Atualiza a disponibilidade de profissionais enquanto a pessoa aguarda (a cada 60 s).
  useEffect(() => {
    if (state.status !== "waiting_human") return;
    const refresh = async () => {
      const { data } = await getBrowserSupabase().rpc("available_clinicians_count");
      if (typeof data === "number") dispatch({ type: "availability", value: data });
    };
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, [state.status]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return {
    state,
    begin,
    send,
    retryMessage,
    retryAI,
    requestHuman,
    cancelHumanRequest,
    closeConversation,
    startNew,
    dismissSafety,
  };
}
