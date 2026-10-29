import { AIProviderError, type ChatProvider, type ChatRequest, type StreamEvent } from "../types";

/**
 * Provedor SIMULADO — para desenvolvimento local e testes automatizados.
 * Não é inteligência artificial: escolhe respostas fixas por palavras-chave.
 * A interface mostra o selo "Modo demonstração" sempre que ele está ativo.
 *
 * Gatilhos de teste (apenas neste provedor):
 *   "[[falha]]"  → simula indisponibilidade
 *   "[[lento]]"  → atrasa a resposta (para testar transferência durante geração)
 */
export class MockProvider implements ChatProvider {
  readonly name = "mock" as const;
  readonly model = "mock-acolher-1";
  readonly isSimulated = true;

  constructor(private readonly delayMs = 25) {}

  async *stream(request: ChatRequest): AsyncIterable<StreamEvent> {
    const last = [...request.turns].reverse().find((t) => t.role === "user")?.content ?? "";
    if (last.includes("[[falha]]")) {
      throw new AIProviderError("Falha simulada.", "unavailable");
    }
    const reply = pickReply(last, request.system);
    const extraDelay = last.includes("[[lento]]") ? 400 : 0;
    const words = reply.split(/(\s+)/);
    for (const word of words) {
      if (request.signal.aborted) throw new AIProviderError("Cancelado.", "timeout");
      await sleep(this.delayMs + extraDelay / words.length);
      yield { type: "text", text: word };
    }
    yield {
      type: "done",
      stopReason: "end_turn",
      model: this.model,
      usage: { inputTokens: approxTokens(request.system) + approxTokens(last), outputTokens: approxTokens(reply) },
    };
  }
}

function pickReply(text: string, system: string): string {
  const t = text.toLowerCase();
  const safety = system.includes("[PROTOCOLO DE SEGURANÇA ATIVO]");
  if (safety) {
    return "Sinto muito que você esteja sentindo isso. Você não está sozinho(a) agora. Se você pode se machucar, ligue para o SAMU (192) ou para o CVV (188). Você quer me contar o que está acontecendo?";
  }
  if (t.includes("crise")) {
    return "Sinto muito que este momento esteja tão difícil. Podemos ir com calma. Você prefere me contar o que aconteceu ou quer ajuda para encontrar algo que traga um pouco de conforto agora?";
  }
  if (t.includes("não consigo escrever") || t.includes("nao consigo escrever")) {
    return "Tudo bem. Você não precisa escrever. Pode usar os botões. Você prefere conversar ou fazer uma pausa?";
  }
  if (t.includes("silêncio") || t.includes("silencio")) {
    return "Tudo bem. Vou ficar aqui em silêncio. Quando quiser, é só escrever ou tocar em um botão.";
  }
  if (t.includes("ansios") || t.includes("medo") || t.includes("sobrecarregad")) {
    return "Obrigado por me contar. Isso parece pesado. Você gostaria de uma sugestão simples ou prefere que eu apenas escute?";
  }
  if (t.includes("pessoa")) {
    return "Entendi. Você pode usar o botão \"Quero falar com uma pessoa\". Enquanto isso, eu continuo aqui.";
  }
  return "Estou aqui com você. Pode falar no seu ritmo. O que você está sentindo agora?";
}

function approxTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
