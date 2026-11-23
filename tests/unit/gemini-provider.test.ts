// @vitest-environment node
/**
 * Adaptador Gemini com a API simulada (nenhuma chamada real ao Google).
 */
import { ApiError, FinishReason, HarmBlockThreshold, HarmCategory, type GenerateContentParameters } from "@google/genai";
import { describe, expect, it } from "vitest";
import { parseAIEnv } from "@/lib/ai/config";
import { GEMINI_SAFETY_SETTINGS, GeminiProvider, type GeminiModels } from "@/lib/ai/providers/gemini";
import { AIProviderError, type StreamEvent } from "@/lib/ai/types";

type Chunk = Record<string, unknown>;

function chunk(text: string | null, extra: Chunk = {}): Chunk {
  return {
    candidates: text === null ? [] : [{ content: { role: "model", parts: [{ text }] } }],
    modelVersion: "gemini-3.8-flash",
    get text() {
      return text ?? undefined;
    },
    ...extra,
  };
}

/** Resposta que nunca começa (servidor "travado"); só termina quando a tentativa é cancelada. */
const STALL = Symbol("stall");

function fakeModels(responses: (Chunk[] | Error | typeof STALL)[]): GeminiModels & { calls: GenerateContentParameters[] } {
  const calls: GenerateContentParameters[] = [];
  return {
    calls,
    async generateContentStream(params) {
      calls.push(params);
      const next = responses.shift();
      if (!next) throw new Error("sem resposta simulada");
      if (next instanceof Error) throw next;
      if (next === STALL) {
        const signal = params.config?.abortSignal;
        return (async function* () {
          await new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted"))));
          yield undefined as never;
        })();
      }
      return (async function* () {
        for (const c of next) yield c as never;
      })();
    },
  };
}

async function collect(provider: GeminiProvider): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const e of provider.stream({
    system: "Você é o assistente de acolhimento.",
    turns: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Olá, estou aqui." },
      { role: "user", content: "Estou em crise." },
    ],
    maxOutputTokens: 4000,
    signal: new AbortController().signal,
  })) {
    events.push(e);
  }
  return events;
}

const apiError = (status: number, message: string) => new ApiError({ status, message });

describe("filtros de segurança do Gemini", () => {
  it("não bloqueiam desabafos: risco, assédio e ódio só a partir de probabilidade alta", () => {
    const byCategory = Object.fromEntries(GEMINI_SAFETY_SETTINGS.map((s) => [s.category, s.threshold]));
    expect(byCategory[HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT]).toBe(HarmBlockThreshold.BLOCK_ONLY_HIGH);
    expect(byCategory[HarmCategory.HARM_CATEGORY_HARASSMENT]).toBe(HarmBlockThreshold.BLOCK_ONLY_HIGH);
    expect(byCategory[HarmCategory.HARM_CATEGORY_HATE_SPEECH]).toBe(HarmBlockThreshold.BLOCK_ONLY_HIGH);
    // Conteúdo sexual explícito segue bloqueado a partir de risco médio.
    expect(byCategory[HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT]).toBe(HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE);
    expect(Object.values(byCategory)).not.toContain(HarmBlockThreshold.BLOCK_LOW_AND_ABOVE);
  });
});

describe("adaptador Gemini", () => {
  it("envia prompt de sistema, histórico com papéis do Gemini e os filtros", async () => {
    const models = fakeModels([[chunk("ok", { candidates: [{ finishReason: FinishReason.STOP }] })]]);
    await collect(new GeminiProvider({ apiKey: "x", model: "gemini-flash-latest", thinkingLevel: "low", models }));
    const params = models.calls[0]!;
    expect(params.model).toBe("gemini-flash-latest");
    expect(params.contents).toEqual([
      { role: "user", parts: [{ text: "Oi" }] },
      { role: "model", parts: [{ text: "Olá, estou aqui." }] },
      { role: "user", parts: [{ text: "Estou em crise." }] },
    ]);
    expect(params.config).toMatchObject({
      systemInstruction: "Você é o assistente de acolhimento.",
      maxOutputTokens: 4000,
      safetySettings: GEMINI_SAFETY_SETTINGS,
      thinkingConfig: { thinkingLevel: "LOW" },
    });
    expect(params.config?.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("transmite o texto em partes e informa uso de tokens", async () => {
    const models = fakeModels([
      [
        chunk("Sinto muito "),
        chunk("que esteja difícil."),
        chunk(null, {
          candidates: [{ finishReason: FinishReason.STOP }],
          usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 20, thoughtsTokenCount: 10 },
        }),
      ],
    ]);
    const events = await collect(new GeminiProvider({ apiKey: "x", model: "gemini-flash-latest", models }));
    const text = events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join("");
    expect(text).toBe("Sinto muito que esteja difícil.");
    expect(events.at(-1)).toEqual({
      type: "done",
      stopReason: FinishReason.STOP,
      model: "gemini-3.8-flash",
      usage: { inputTokens: 120, outputTokens: 30 },
    });
  });

  it("sem nível de raciocínio configurado, não envia thinkingConfig", async () => {
    const models = fakeModels([[chunk("ok")]]);
    await collect(new GeminiProvider({ apiKey: "x", model: "gemini-2.5-flash", models }));
    expect(models.calls[0]!.config).not.toHaveProperty("thinkingConfig");
  });

  it("mensagem bloqueada pelo provedor vira recusa (a pessoa recebe a resposta de segurança)", async () => {
    const blocked = fakeModels([[chunk(null, { promptFeedback: { blockReason: "SAFETY" } })]]);
    const error = await collect(new GeminiProvider({ apiKey: "x", model: "m", models: blocked })).catch((e: unknown) => e);
    expect((error as AIProviderError).kind).toBe("refused");

    const cut = fakeModels([[chunk("Eu "), chunk(null, { candidates: [{ finishReason: FinishReason.SAFETY }] })]]);
    const error2 = await collect(new GeminiProvider({ apiKey: "x", model: "m", models: cut })).catch((e: unknown) => e);
    expect((error2 as AIProviderError).kind).toBe("refused");
  });

  it("servidor sobrecarregado (503): tenta de novo uma vez, com o modelo reserva", async () => {
    const models = fakeModels([apiError(503, "high demand"), [chunk("Estou aqui.")]]);
    const events = await collect(
      new GeminiProvider({ apiKey: "x", model: "gemini-flash-latest", fallbackModel: "gemini-flash-lite-latest", models, retryDelayMs: 0 }),
    );
    expect(models.calls.map((c) => c.model)).toEqual(["gemini-flash-latest", "gemini-flash-lite-latest"]);
    expect(events[0]).toEqual({ type: "text", text: "Estou aqui." });
  });

  it("sem modelo reserva, repete o mesmo modelo; após 3 tentativas o erro vira indisponível", async () => {
    const busy = () => apiError(503, "high demand");
    const models = fakeModels([busy(), busy(), busy()]);
    const error = await collect(new GeminiProvider({ apiKey: "x", model: "m", models, retryDelayMs: 0 })).catch((e: unknown) => e);
    expect(models.calls.map((c) => c.model)).toEqual(["m", "m", "m"]);
    expect((error as AIProviderError).kind).toBe("unavailable");
  });

  it("principal e reserva sobrecarregados: a terceira tentativa ainda responde", async () => {
    const models = fakeModels([apiError(503, "high demand"), apiError(503, "high demand"), [chunk("Oi, estou aqui.")]]);
    const events = await collect(
      new GeminiProvider({ apiKey: "x", model: "principal", fallbackModel: "reserva", models, retryDelayMs: 0 }),
    );
    expect(models.calls.map((c) => c.model)).toEqual(["principal", "reserva", "reserva"]);
    expect(events[0]).toEqual({ type: "text", text: "Oi, estou aqui." });
  });

  it("modelo que não começa a responder é abandonado e o reserva assume", async () => {
    const models = fakeModels([STALL, [chunk("Estou aqui com você.")]]);
    const events = await collect(
      new GeminiProvider({
        apiKey: "x",
        model: "principal",
        fallbackModel: "reserva",
        models,
        retryDelayMs: 0,
        firstChunkTimeoutMs: 20,
      }),
    );
    expect(models.calls.map((c) => c.model)).toEqual(["principal", "reserva"]);
    expect(events[0]).toEqual({ type: "text", text: "Estou aqui com você." });
  });

  it("se todas as tentativas travam, devolve tempo esgotado (a pessoa pode tentar de novo)", async () => {
    const models = fakeModels([STALL, STALL, STALL]);
    const error = await collect(
      new GeminiProvider({ apiKey: "x", model: "m", models, retryDelayMs: 0, firstChunkTimeoutMs: 20 }),
    ).catch((e: unknown) => e);
    expect(models.calls).toHaveLength(3);
    expect((error as AIProviderError).kind).toBe("timeout");
  });

  it.each([
    [429, "You exceeded your current quota, please check your plan and billing", "quota"],
    [429, "Too many requests", "rate_limited"],
    [400, "API key not valid. Please pass a valid API key.", "config"],
    [403, "Permission denied", "config"],
    [404, "models/xyz is not found", "config"],
  ] as const)("erro %i (%s) vira '%s'", async (status, message, kind) => {
    const models = fakeModels([apiError(status, message)]);
    const error = await collect(new GeminiProvider({ apiKey: "x", model: "m", models, retryDelayMs: 0 })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AIProviderError);
    expect((error as AIProviderError).kind).toBe(kind);
  });
});

describe("variáveis de ambiente da IA", () => {
  it("gemini exige GEMINI_API_KEY e usa o modelo padrão", () => {
    expect(parseAIEnv({ AI_PROVIDER: "gemini" })).toMatchObject({ ok: false });
    const ok = parseAIEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "chave" });
    expect(ok.ok && ok.env.GEMINI_MODEL).toBe("gemini-flash-latest");
    expect(ok.ok && ok.env.GEMINI_THINKING_LEVEL).toBe("low");
    expect(ok.ok && ok.env.GEMINI_FALLBACK_MODEL).toBe("gemini-flash-lite-latest");
  });

  it("valida o provedor e nunca expõe a chave na mensagem de erro", () => {
    const bad = parseAIEnv({ AI_PROVIDER: "outro", GEMINI_API_KEY: "segredo-123" });
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(bad)).not.toContain("segredo-123");
    expect(parseAIEnv({}).ok).toBe(true);
  });
});
