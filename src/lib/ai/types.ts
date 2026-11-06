/**
 * Contrato independente de provedor. Cada adaptador (Anthropic, OpenAI,
 * simulado) implementa `ChatProvider` usando o SDK oficial do próprio provedor.
 */

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  system: string;
  turns: ChatTurn[];
  maxOutputTokens: number;
  signal: AbortSignal;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
}

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "done"; usage: ChatUsage; stopReason: string | null; model: string };

export interface ChatProvider {
  readonly name: "anthropic" | "openai" | "mock";
  readonly model: string;
  /** True quando as respostas são simuladas (sem IA real). Exibido na interface. */
  readonly isSimulated: boolean;
  stream(request: ChatRequest): AsyncIterable<StreamEvent>;
}

/** Erro normalizado: a rota trata todos os provedores da mesma forma. */
export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly kind: "timeout" | "rate_limited" | "quota" | "unavailable" | "refused" | "config",
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}
