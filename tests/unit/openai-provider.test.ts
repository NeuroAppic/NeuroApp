// @vitest-environment node
/**
 * Adaptador OpenAI com a API simulada (fetch falso): nenhuma chamada paga.
 * Confere o formato do pedido, a leitura do streaming e o tratamento de erros.
 */
import { describe, expect, it } from "vitest";
import { OpenAIProvider } from "@/lib/ai/providers/openai";
import { AIProviderError, type StreamEvent } from "@/lib/ai/types";

function sse(chunks: unknown[]): Response {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function chunk(content: string | null, finish: string | null = null) {
  return {
    id: "c1",
    object: "chat.completion.chunk",
    created: 1,
    model: "gpt-5.5-2026-04-23",
    choices: [{ index: 0, delta: content === null ? {} : { content }, finish_reason: finish }],
  };
}

async function collect(provider: OpenAIProvider): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const e of provider.stream({
    system: "Você é o assistente de acolhimento.",
    turns: [{ role: "user", content: "Estou em crise." }],
    maxOutputTokens: 4000,
    signal: new AbortController().signal,
  })) {
    events.push(e);
  }
  return events;
}

describe("adaptador OpenAI", () => {
  it("envia o pedido correto e transmite a resposta em partes", async () => {
    let sent: Record<string, unknown> = {};
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return sse([
        chunk("Sinto muito "),
        chunk("que esteja difícil."),
        chunk(null, "stop"),
        { ...chunk(null), choices: [], usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 } },
      ]);
    }) as unknown as typeof fetch;

    const provider = new OpenAIProvider({ apiKey: "sk-teste", model: "gpt-5.5", reasoningEffort: "low", fetch: fakeFetch });
    const events = await collect(provider);

    expect(sent).toMatchObject({
      model: "gpt-5.5",
      stream: true,
      store: false,
      reasoning_effort: "low",
      max_completion_tokens: 4000,
      messages: [
        { role: "system", content: "Você é o assistente de acolhimento." },
        { role: "user", content: "Estou em crise." },
      ],
    });
    const text = events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join("");
    expect(text).toBe("Sinto muito que esteja difícil.");
    expect(events.at(-1)).toEqual({
      type: "done",
      stopReason: "stop",
      model: "gpt-5.5-2026-04-23",
      usage: { inputTokens: 120, outputTokens: 30 },
    });
  });

  it("não envia reasoning_effort quando não configurado", async () => {
    let sent: Record<string, unknown> = {};
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return sse([chunk("oi", "stop")]);
    }) as unknown as typeof fetch;
    await collect(new OpenAIProvider({ apiKey: "sk-teste", model: "gpt-4.1", fetch: fakeFetch }));
    expect(sent).not.toHaveProperty("reasoning_effort");
  });

  it("falta de créditos vira erro 'quota' (não adianta tentar de novo)", async () => {
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({ error: { message: "You have no credits remaining.", type: "insufficient_quota", code: "credit_balance_exhausted" } }),
        { status: 429, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;
    const provider = new OpenAIProvider({ apiKey: "sk-teste", model: "gpt-5.5", fetch: fakeFetch });
    const error = await collect(provider).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AIProviderError);
    expect((error as AIProviderError).kind).toBe("quota");
  });

  it("chave inválida vira erro de configuração", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ error: { message: "Incorrect API key", type: "invalid_request_error", code: "invalid_api_key" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    const error = await collect(new OpenAIProvider({ apiKey: "sk-x", model: "gpt-5.5", fetch: fakeFetch })).catch((e: unknown) => e);
    expect((error as AIProviderError).kind).toBe("config");
  });

  it("filtro de conteúdo do provedor vira recusa", async () => {
    const fakeFetch = (async () => sse([chunk(null, "content_filter")])) as unknown as typeof fetch;
    const error = await collect(new OpenAIProvider({ apiKey: "sk-x", model: "gpt-5.5", fetch: fakeFetch })).catch((e: unknown) => e);
    expect((error as AIProviderError).kind).toBe("refused");
  });
});
