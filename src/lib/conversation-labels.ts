import type { ConversationStatus } from "@/types/domain";

export const STATUS_LABEL: Record<ConversationStatus, string> = {
  ai_active: "Com a IA",
  waiting_human: "Aguardando pessoa",
  human_active: "Em atendimento",
  closed: "Encerrada",
  archived: "Arquivada",
};
