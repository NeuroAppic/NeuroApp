/**
 * Estado do chat como reducer puro (testável sem rede).
 */
import type { ChatStreamEvent } from "@/lib/chat/protocol";
import type { ChatMessage, ConversationStatus, MessageInputSource, RiskLevel } from "@/types/domain";

export type Phase = "checking" | "consent" | "starting" | "ready" | "unavailable" | "start_failed";
export type Connection = "connecting" | "live" | "reconnecting" | "offline";

export interface PendingMessage {
  clientId: string;
  content: string;
  source: MessageInputSource;
  state: "sending" | "failed";
  error?: string;
}

export interface ChatState {
  phase: Phase;
  conversationId: string | null;
  status: ConversationStatus;
  stateVersion: number;
  assignedLabel: string | null;
  messages: ChatMessage[];
  pending: PendingMessage[];
  ai: { state: "idle" | "thinking" | "streaming"; draft: string };
  aiUnavailable: { fallbackText: string; retryable: boolean } | null;
  simulated: boolean;
  safety: { level: RiskLevel; escalated: boolean; visible: boolean };
  availableProfessionals: number | null;
  connection: Connection;
  notice: string | null;
  /** Última mensagem recebida de outra pessoa/sistema, para leitores de tela. */
  announcement: string;
}

export const initialChatState: ChatState = {
  phase: "checking",
  conversationId: null,
  status: "ai_active",
  stateVersion: 0,
  assignedLabel: null,
  messages: [],
  pending: [],
  ai: { state: "idle", draft: "" },
  aiUnavailable: null,
  simulated: false,
  safety: { level: "none", escalated: false, visible: false },
  availableProfessionals: null,
  connection: "connecting",
  notice: null,
  announcement: "",
};

export type ChatAction =
  | { type: "needs_consent" }
  | { type: "unavailable" }
  | { type: "starting" }
  | { type: "start_failed" }
  | {
      type: "loaded";
      conversationId: string;
      status: ConversationStatus;
      stateVersion: number;
      assignedLabel: string | null;
      riskLevel: RiskLevel;
      messages: ChatMessage[];
    }
  | { type: "sending"; clientId: string; content: string; source: MessageInputSource }
  | { type: "send_failed"; clientId: string; error: string }
  | { type: "stream_event"; event: ChatStreamEvent }
  | { type: "message_received"; message: ChatMessage }
  | { type: "status_changed"; status: ConversationStatus; stateVersion: number; assignedLabel: string | null }
  | { type: "human_requested"; status: ConversationStatus; stateVersion: number; availableProfessionals: number }
  | { type: "availability"; value: number }
  | { type: "connection"; value: Connection }
  | { type: "ai_cancelled" }
  | { type: "retrying_ai" }
  | { type: "notice"; message: string | null }
  | { type: "dismiss_safety" };

const RISK_ORDER: Record<RiskLevel, number> = { none: 0, attention: 1, high: 2, critical: 3 };

export function sortMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) =>
    a.created_at === b.created_at ? a.id.localeCompare(b.id) : a.created_at.localeCompare(b.created_at),
  );
}

/** Insere ou substitui por id, mantendo a ordem cronológica. */
export function upsertMessage(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const without = messages.filter((m) => m.id !== message.id);
  return sortMessages([...without, message]);
}

function describeForAnnouncement(message: ChatMessage): string {
  if (message.sender === "staff") return `${message.sender_label ?? "Profissional"}: ${message.content}`;
  if (message.sender === "system") return `Aviso: ${message.content}`;
  if (message.sender === "ai") return `Assistente virtual: ${message.content}`;
  return "";
}

function withMessage(state: ChatState, message: ChatMessage): ChatState {
  if (message.conversation_id !== state.conversationId) return state;
  const next: ChatState = {
    ...state,
    messages: upsertMessage(state.messages, message),
    pending: message.client_message_id
      ? state.pending.filter((p) => p.clientId !== message.client_message_id)
      : state.pending,
  };
  if (message.sender !== "user") {
    next.announcement = describeForAnnouncement(message);
  }
  if (message.sender === "ai") {
    next.ai = { state: "idle", draft: "" };
    next.aiUnavailable = null;
  }
  return next;
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "needs_consent":
      return { ...initialChatState, phase: "consent" };
    case "unavailable":
      return { ...state, phase: "unavailable" };
    case "starting":
      return { ...state, phase: "starting" };
    case "start_failed":
      return { ...state, phase: "start_failed" };
    case "loaded": {
      const elevated = RISK_ORDER[action.riskLevel] >= RISK_ORDER.high;
      return {
        ...state,
        phase: "ready",
        conversationId: action.conversationId,
        status: action.status,
        stateVersion: action.stateVersion,
        assignedLabel: action.assignedLabel,
        messages: sortMessages(action.messages),
        pending: state.conversationId === action.conversationId ? state.pending : [],
        safety: elevated
          ? { level: action.riskLevel, escalated: false, visible: state.safety.visible || state.conversationId !== action.conversationId }
          : state.safety,
      };
    }
    case "sending":
      return {
        ...state,
        notice: null,
        aiUnavailable: null,
        pending: [
          ...state.pending.filter((p) => p.clientId !== action.clientId),
          { clientId: action.clientId, content: action.content, source: action.source, state: "sending" },
        ],
        ai: state.status === "human_active" ? state.ai : { state: "thinking", draft: "" },
      };
    case "send_failed":
      return {
        ...state,
        ai: { state: "idle", draft: "" },
        pending: state.pending.map((p) =>
          p.clientId === action.clientId ? { ...p, state: "failed", error: action.error } : p,
        ),
      };
    case "message_received":
      return withMessage(state, action.message);
    case "status_changed": {
      // Uma atualização antiga (versão menor) não sobrescreve uma mais nova.
      if (action.stateVersion < state.stateVersion) return state;
      const aiBlocked = action.status !== "ai_active" && action.status !== "waiting_human";
      return {
        ...state,
        status: action.status,
        stateVersion: action.stateVersion,
        assignedLabel: action.status === "human_active" ? action.assignedLabel : null,
        ai: aiBlocked ? { state: "idle", draft: "" } : state.ai,
        aiUnavailable: aiBlocked ? null : state.aiUnavailable,
      };
    }
    case "human_requested":
      return {
        ...state,
        status: action.stateVersion >= state.stateVersion ? action.status : state.status,
        stateVersion: Math.max(action.stateVersion, state.stateVersion),
        availableProfessionals: action.availableProfessionals,
      };
    case "availability":
      return { ...state, availableProfessionals: action.value };
    case "connection":
      return { ...state, connection: action.value };
    case "ai_cancelled":
      return { ...state, ai: { state: "idle", draft: "" } };
    case "retrying_ai":
      return { ...state, aiUnavailable: null, ai: { state: "thinking", draft: "" } };
    case "notice":
      return { ...state, notice: action.message };
    case "dismiss_safety":
      return { ...state, safety: { ...state.safety, visible: false } };
    case "stream_event":
      return applyStreamEvent(state, action.event);
  }
}

function applyStreamEvent(state: ChatState, event: ChatStreamEvent): ChatState {
  switch (event.type) {
    case "user_message": {
      const next = withMessage(state, event.message);
      if (event.stateVersion >= state.stateVersion) {
        next.status = event.status;
        next.stateVersion = event.stateVersion;
      }
      return next;
    }
    case "safety":
      return {
        ...state,
        safety: {
          level: RISK_ORDER[event.level] > RISK_ORDER[state.safety.level] ? event.level : state.safety.level,
          escalated: state.safety.escalated || event.escalated,
          visible: true,
        },
        availableProfessionals: event.availableProfessionals,
      };
    case "ai_start":
      return { ...state, simulated: event.simulated, ai: { state: "thinking", draft: "" } };
    case "delta":
      if (state.status === "human_active") return state;
      return { ...state, ai: { state: "streaming", draft: state.ai.draft + event.text } };
    case "ai_message":
      return withMessage(state, event.message);
    case "discarded":
    case "ai_skipped":
      return { ...state, ai: { state: "idle", draft: "" } };
    case "ai_unavailable":
      return {
        ...state,
        ai: { state: "idle", draft: "" },
        aiUnavailable: { fallbackText: event.fallbackText, retryable: event.retryable },
      };
    case "error":
      return { ...state, ai: { state: "idle", draft: "" }, notice: event.message };
  }
}
