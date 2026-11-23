import "server-only";

import {
  ApiError,
  FinishReason,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  type Content,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type SafetySetting,
  ThinkingLevel,
} from "@google/genai";
import { AIProviderError, type ChatProvider, type ChatRequest, type StreamEvent } from "../types";

/**
 * Filtros de segurança calibrados para acolhimento emocional.
 *
 * Os padrões do Gemini podem bloquear desabafos legítimos ("quero morrer",
 * relatos de violência sofrida, autolesão). Aqui só bloqueamos conteúdo com
 * probabilidade ALTA de dano; o cuidado com quem está em risco fica com o
 * prompt de sistema (acolher, orientar, oferecer CVV/SAMU e atendimento
 * humano) e com o classificador de risco do servidor. Se mesmo assim o
 * provedor bloquear, a pessoa recebe a resposta de segurança determinística
 * (fallbackSafetyReply) — nunca fica sem resposta.
 *
 * Conteúdo sexual explícito continua bloqueado a partir de risco médio:
 * não faz parte do acolhimento e protege menores que possam usar o portal.
 */
export const GEMINI_SAFETY_SETTINGS: SafetySetting[] = [
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

const BLOCKING_FINISH_REASONS = new Set<FinishReason | undefined>([
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
]);

/** Só a parte do cliente que o adaptador usa (permite simular nos testes). */
export interface GeminiModels {
  generateContentStream(params: GenerateContentParameters): Promise<AsyncGenerator<GenerateContentResponse>>;
}

export type GeminiThinkingLevel = "minimal" | "low" | "medium" | "high";

const THINKING_LEVELS: Record<GeminiThinkingLevel, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

/** Respostas 503 (servidor sobrecarregado) costumam passar em segundos. */
const RETRY_DELAY_MS = 800;
/**
 * Se o modelo não começa a responder nesse tempo, desiste dele e tenta o
 * próximo (o Google às vezes "trava" em vez de devolver 503). Com 3 tentativas,
 * o pior caso fica abaixo do limite geral de AI_TIMEOUT_MS (45 s).
 */
const FIRST_CHUNK_TIMEOUT_MS = 12_000;
const MAX_ATTEMPTS = 3;

export interface GeminiProviderOptions {
  apiKey: string;
  model: string;
  /** Modelos 3.x: profundidade do raciocínio. "low" responde rápido, bom para conversa. */
  thinkingLevel?: GeminiThinkingLevel;
  /** Modelo usado na nova tentativa quando o principal está sobrecarregado (503). */
  fallbackModel?: string;
  /** Espera antes da nova tentativa (0 nos testes). */
  retryDelayMs?: number;
  /** Tempo máximo até o primeiro pedaço da resposta, por tentativa. */
  firstChunkTimeoutMs?: number;
  /** Injetado nos testes; em produção usa o SDK oficial @google/genai. */
  models?: GeminiModels;
}

/** Adaptador Google Gemini (Google AI Studio) com streaming. */
export class GeminiProvider implements ChatProvider {
  readonly name = "gemini" as const;
  readonly isSimulated = false;
  readonly model: string;
  private readonly models: GeminiModels;
  private readonly thinkingLevel?: GeminiThinkingLevel;
  private readonly fallbackModel?: string;
  private readonly retryDelayMs: number;
  private readonly firstChunkTimeoutMs: number;

  constructor(options: GeminiProviderOptions) {
    this.model = options.model;
    this.thinkingLevel = options.thinkingLevel;
    this.fallbackModel = options.fallbackModel;
    this.retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;
    this.firstChunkTimeoutMs = options.firstChunkTimeoutMs ?? FIRST_CHUNK_TIMEOUT_MS;
    this.models = options.models ?? new GoogleGenAI({ apiKey: options.apiKey }).models;
  }

  async *stream(request: ChatRequest): AsyncIterable<StreamEvent> {
    // A API do Gemini chama o papel do assistente de "model".
    const contents: Content[] = request.turns.map((t) => ({
      role: t.role === "assistant" ? "model" : "user",
      parts: [{ text: t.content }],
    }));

    const params: GenerateContentParameters = {
      model: this.model,
      contents,
      config: {
        systemInstruction: request.system,
        maxOutputTokens: request.maxOutputTokens,
        safetySettings: GEMINI_SAFETY_SETTINGS,
        abortSignal: request.signal,
        ...(this.thinkingLevel ? { thinkingConfig: { thinkingLevel: THINKING_LEVELS[this.thinkingLevel] } } : {}),
      },
    };

    try {
      const { first, stream } = await this.open(params, request.signal);

      let usage = { inputTokens: 0, outputTokens: 0 };
      let finishReason: FinishReason | undefined;
      let model = this.model;
      for await (const chunk of withFirst(first, stream)) {
        if (request.signal.aborted) throw new AIProviderError("Geração cancelada.", "timeout");
        if (chunk.promptFeedback?.blockReason) {
          throw new AIProviderError("O provedor bloqueou a mensagem.", "refused");
        }
        model = chunk.modelVersion ?? model;
        const candidate = chunk.candidates?.[0];
        if (candidate?.finishReason) finishReason = candidate.finishReason;
        const text = chunk.text;
        if (text) yield { type: "text", text };
        if (chunk.usageMetadata) {
          usage = {
            inputTokens: chunk.usageMetadata.promptTokenCount ?? 0,
            outputTokens:
              (chunk.usageMetadata.candidatesTokenCount ?? 0) + (chunk.usageMetadata.thoughtsTokenCount ?? 0),
          };
        }
      }

      if (BLOCKING_FINISH_REASONS.has(finishReason)) {
        throw new AIProviderError("O provedor interrompeu a resposta por segurança.", "refused");
      }
      yield { type: "done", stopReason: finishReason ?? null, model, usage };
    } catch (error) {
      throw normalizeGeminiError(error, request.signal);
    }
  }

  /**
   * Abre o streaming e espera o primeiro pedaço. Se o servidor estiver
   * sobrecarregado (5xx) ou demorar demais para começar, tenta de novo — até
   * 3 vezes (MAX_ATTEMPTS), alternando com o modelo reserva quando configurado.
   * Nada foi mostrado à pessoa até o primeiro pedaço, então repetir é seguro.
   */
  private async open(
    params: GenerateContentParameters,
    signal: AbortSignal,
  ): Promise<{ first: IteratorResult<GenerateContentResponse>; stream: AsyncGenerator<GenerateContentResponse> }> {
    const fallback = this.fallbackModel ?? this.model;
    // Principal, depois o reserva (mais leve e, na prática, mais disponível).
    const plan = [this.model, fallback, fallback].slice(0, MAX_ATTEMPTS);
    for (let attempt = 0; ; attempt++) {
      // Cada tentativa tem o próprio cancelamento, ligado ao da requisição.
      const controller = new AbortController();
      const forward = () => controller.abort();
      signal.addEventListener("abort", forward, { once: true });
      let stalled = false;
      const timer = setTimeout(() => {
        stalled = true;
        controller.abort();
      }, this.firstChunkTimeoutMs);
      try {
        const stream = await this.models.generateContentStream({
          ...params,
          model: plan[attempt]!,
          config: { ...params.config, abortSignal: controller.signal },
        });
        const first = await stream.next();
        clearTimeout(timer);
        return { first, stream };
      } catch (error) {
        clearTimeout(timer);
        signal.removeEventListener("abort", forward);
        if (signal.aborted) throw error;
        const busy = stalled || (error instanceof ApiError && error.status >= 500);
        if (!busy || attempt + 1 >= plan.length) {
          throw stalled ? new AIProviderError("O provedor demorou para responder.", "timeout", error) : error;
        }
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * (attempt + 1)));
      }
    }
  }
}

/** Devolve o primeiro pedaço já lido e continua com o resto do streaming. */
async function* withFirst<T>(first: IteratorResult<T>, rest: AsyncGenerator<T>): AsyncGenerator<T> {
  if (first.done) return;
  yield first.value;
  yield* rest;
}

export function normalizeGeminiError(error: unknown, signal: AbortSignal): unknown {
  if (error instanceof AIProviderError) return error;
  if (signal.aborted) return new AIProviderError("Geração cancelada ou expirada.", "timeout", error);
  if (error instanceof ApiError) {
    if (error.status === 429) {
      // RESOURCE_EXHAUSTED: cota do plano gratuito/créditos ou excesso de requisições.
      return /quota|billing|credit/i.test(error.message)
        ? new AIProviderError("Cota do provedor esgotada.", "quota", error)
        : new AIProviderError("Limite do provedor atingido.", "rate_limited", error);
    }
    if (error.status === 400 && /api key/i.test(error.message)) {
      return new AIProviderError("Credencial do provedor inválida.", "config", error);
    }
    if (error.status === 401 || error.status === 403) {
      return new AIProviderError("Credencial do provedor inválida.", "config", error);
    }
    if (error.status === 404) {
      return new AIProviderError("Modelo não encontrado para esta chave.", "config", error);
    }
    if (error.status === 408 || error.status === 504) {
      return new AIProviderError("Tempo esgotado no provedor.", "timeout", error);
    }
  }
  return new AIProviderError("Provedor indisponível.", "unavailable", error);
}
