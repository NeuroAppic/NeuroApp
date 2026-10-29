/**
 * Protocolo de streaming do chat: NDJSON (um evento JSON por linha).
 * Compartilhado entre a rota do servidor e o cliente.
 */
import type { ChatMessage, ConversationStatus, RiskLevel } from "@/types/domain";

export type ChatStreamEvent =
  | {
      type: "user_message";
      message: ChatMessage;
      status: ConversationStatus;
      stateVersion: number;
      duplicate: boolean;
    }
  | {
      type: "safety";
      level: RiskLevel;
      escalated: boolean;
      availableProfessionals: number;
    }
  | { type: "ai_start"; simulated: boolean }
  | { type: "delta"; text: string }
  | { type: "ai_message"; message: ChatMessage }
  /** A resposta foi descartada (humano assumiu ou a pessoa já mandou outra mensagem). */
  | { type: "discarded"; reason: "state_changed" }
  /** IA não responde porque há um profissional na conversa. */
  | { type: "ai_skipped"; reason: "human_active" | "already_answered" }
  | { type: "ai_unavailable"; fallbackText: string; retryable: boolean }
  | { type: "error"; code: string; message: string };

export function encodeEvent(event: ChatStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

/** Lê um corpo NDJSON e entrega cada evento. Tolera linhas quebradas entre chunks. */
export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line) as ChatStreamEvent);
      newline = buffer.indexOf("\n");
    }
  }
  const rest = buffer.trim();
  if (rest) onEvent(JSON.parse(rest) as ChatStreamEvent);
}
