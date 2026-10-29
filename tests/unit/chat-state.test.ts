import { describe, expect, it } from "vitest";
import { chatReducer, initialChatState, type ChatState } from "@/features/chat/chat-state";
import { encodeEvent, readEventStream, type ChatStreamEvent } from "@/lib/chat/protocol";
import type { ChatMessage } from "@/types/domain";

const CONV = "11111111-1111-4111-8111-111111111111";

function message(partial: Partial<ChatMessage> & Pick<ChatMessage, "id" | "sender">): ChatMessage {
  return {
    conversation_id: CONV,
    sender_label: null,
    content: "texto",
    client_message_id: null,
    input_source: null,
    reply_to_id: null,
    created_at: new Date().toISOString(),
    ...partial,
  };
}

function ready(): ChatState {
  return chatReducer(initialChatState, {
    type: "loaded",
    conversationId: CONV,
    status: "ai_active",
    stateVersion: 1,
    assignedLabel: null,
    riskLevel: "none",
    messages: [],
  });
}

describe("estado do chat", () => {
  it("mensagem otimista vira mensagem confirmada sem duplicar", () => {
    let s = chatReducer(ready(), { type: "sending", clientId: "c1", content: "Oi", source: "typed" });
    expect(s.pending).toHaveLength(1);
    expect(s.ai.state).toBe("thinking");
    const confirmed = message({ id: "m1", sender: "user", content: "Oi", client_message_id: "c1" });
    s = chatReducer(s, { type: "stream_event", event: { type: "user_message", message: confirmed, status: "ai_active", stateVersion: 1, duplicate: false } });
    // A mesma mensagem chegando também pelo Realtime não duplica.
    s = chatReducer(s, { type: "message_received", message: confirmed });
    expect(s.pending).toHaveLength(0);
    expect(s.messages).toHaveLength(1);
  });

  it("falha de envio mantém a mensagem para reenvio (nada se perde)", () => {
    let s = chatReducer(ready(), { type: "sending", clientId: "c1", content: "Oi", source: "quick" });
    s = chatReducer(s, { type: "send_failed", clientId: "c1", error: "Sem conexão" });
    expect(s.pending[0]).toMatchObject({ clientId: "c1", content: "Oi", state: "failed" });
  });

  it("transferência para humano interrompe o texto da IA e bloqueia novos trechos", () => {
    let s = chatReducer(ready(), { type: "stream_event", event: { type: "ai_start", simulated: false } });
    s = chatReducer(s, { type: "stream_event", event: { type: "delta", text: "Olá" } });
    expect(s.ai.draft).toBe("Olá");
    s = chatReducer(s, { type: "status_changed", status: "human_active", stateVersion: 3, assignedLabel: "Ana · Psicóloga" });
    expect(s.ai).toEqual({ state: "idle", draft: "" });
    expect(s.assignedLabel).toBe("Ana · Psicóloga");
    s = chatReducer(s, { type: "stream_event", event: { type: "delta", text: " atrasado" } });
    expect(s.ai.draft).toBe("");
  });

  it("ignora atualização de estado antiga (fora de ordem)", () => {
    let s = chatReducer(ready(), { type: "status_changed", status: "human_active", stateVersion: 5, assignedLabel: "Ana" });
    s = chatReducer(s, { type: "status_changed", status: "waiting_human", stateVersion: 4, assignedLabel: null });
    expect(s.status).toBe("human_active");
  });

  it("IA indisponível mostra alternativa sem perder a mensagem", () => {
    let s = chatReducer(ready(), { type: "stream_event", event: { type: "ai_unavailable", fallbackText: "Tente de novo", retryable: true } });
    expect(s.aiUnavailable?.retryable).toBe(true);
    s = chatReducer(s, { type: "retrying_ai" });
    expect(s.aiUnavailable).toBeNull();
  });

  it("sinal de segurança exibe o painel e guarda o maior nível", () => {
    let s = chatReducer(ready(), { type: "stream_event", event: { type: "safety", level: "critical", escalated: false, availableProfessionals: 0 } });
    s = chatReducer(s, { type: "stream_event", event: { type: "safety", level: "high", escalated: true, availableProfessionals: 0 } });
    expect(s.safety).toEqual({ level: "critical", escalated: true, visible: true });
    expect(s.availableProfessionals).toBe(0);
  });

  it("anuncia mensagens recebidas de profissionais para leitores de tela", () => {
    const s = chatReducer(ready(), { type: "message_received", message: message({ id: "s1", sender: "staff", sender_label: "Ana", content: "Estou aqui" }) });
    expect(s.announcement).toBe("Ana: Estou aqui");
  });
});

describe("protocolo NDJSON", () => {
  it("reconstrói eventos divididos entre pedaços da rede", async () => {
    const events: ChatStreamEvent[] = [
      { type: "ai_start", simulated: true },
      { type: "delta", text: "Olá, " },
      { type: "delta", text: "tudo bem?" },
    ];
    const bytes = new Uint8Array(events.flatMap((e) => [...encodeEvent(e)]));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
        controller.close();
      },
    });
    const received: ChatStreamEvent[] = [];
    await readEventStream(stream, (e) => received.push(e));
    expect(received).toEqual(events);
  });
});
