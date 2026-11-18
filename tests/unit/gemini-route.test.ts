// @vitest-environment node
/**
 * Rota do chat com AI_PROVIDER=gemini: o streaming do Gemini (simulado)
 * chega ao navegador como NDJSON e a resposta é gravada condicionada à versão.
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { readEventStream, type ChatStreamEvent } from "@/lib/chat/protocol";

const CONV = "44444444-4444-4444-8444-444444444444";
const USER = "55555555-5555-4555-8555-555555555555";

const sentParams: Record<string, unknown>[] = [];
vi.mock("@google/genai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/genai")>();
  class FakeGoogleGenAI {
    models = {
      generateContentStream: async (params: Record<string, unknown>) => {
        sentParams.push(params);
        return (async function* () {
          for (const text of ["Sinto muito. ", "Estou aqui com você."]) {
            yield { text, candidates: [{ content: { parts: [{ text }] } }], modelVersion: "gemini-3.8-flash" };
          }
          yield {
            text: undefined,
            candidates: [{ finishReason: actual.FinishReason.STOP }],
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 12 },
          };
        })();
      },
    };
  }
  return { ...actual, GoogleGenAI: FakeGoogleGenAI };
});

const rpc = vi.fn();
const usage: Record<string, unknown>[] = [];
function builder(table: string) {
  const history = [{ id: "m1", conversation_id: CONV, sender: "user", content: "Estou em crise.", created_at: new Date().toISOString() }];
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "order", "limit", "in"]) b[m] = () => b;
  b.maybeSingle = async () => ({ data: null, error: null });
  b.insert = async (row: Record<string, unknown>) => {
    if (table === "ai_usage") usage.push(row);
    return { error: null };
  };
  b.then = (resolve: (v: unknown) => void) => resolve({ data: table === "messages" ? history : null, error: null, count: 0 });
  return b;
}
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: () => ({ rpc, from: builder }) }));
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: { id: USER } } }) } }),
}));

process.env.AI_PROVIDER = "gemini";
process.env.GEMINI_API_KEY = "chave-de-teste";

describe("rota do chat com Gemini", () => {
  it("transmite NDJSON e grava a resposta da IA", async () => {
    rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "post_user_message") {
        return {
          data: {
            message: { id: "m1", conversation_id: CONV, sender: "user", content: "Estou em crise.", created_at: new Date().toISOString() },
            status: "ai_active",
            state_version: 3,
            escalated: false,
            duplicate: false,
          },
          error: null,
        };
      }
      if (fn === "commit_ai_message") {
        return { data: { id: "a1", conversation_id: CONV, sender: "ai", content: args.p_content }, error: null };
      }
      return { data: 0, error: null };
    });

    const { POST } = await import("@/app/api/conversations/[id]/messages/route");
    const response = await POST(
      new NextRequest(`http://localhost/api/conversations/${CONV}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost", host: "localhost" },
        body: JSON.stringify({ content: "Estou em crise.", clientMessageId: crypto.randomUUID(), source: "quick" }),
      }),
      { params: Promise.resolve({ id: CONV }) } as never,
    );

    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    const raw: string[] = [];
    const events: ChatStreamEvent[] = [];
    const [a, b] = response.body!.tee();
    await readEventStream(a, (e) => events.push(e));
    const reader = b.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      raw.push(new TextDecoder().decode(value));
    }
    // Cada linha é um JSON completo.
    for (const line of raw.join("").trim().split("\n")) expect(() => JSON.parse(line)).not.toThrow();

    expect(events.map((e) => e.type)).toEqual(["user_message", "ai_start", "delta", "delta", "ai_message"]);
    expect(events.find((e) => e.type === "ai_start")).toEqual({ type: "ai_start", simulated: false });
    const commit = rpc.mock.calls.find(([fn]) => fn === "commit_ai_message")![1];
    expect(commit).toMatchObject({
      p_expected_version: 3,
      p_content: "Sinto muito. Estou aqui com você.",
      p_provider: "gemini",
      p_model: "gemini-3.8-flash",
    });
    expect(sentParams[0]).toMatchObject({ model: "gemini-flash-latest" });
    expect(usage[0]).toMatchObject({ provider: "gemini", outcome: "ok", input_tokens: 100, output_tokens: 12 });
  });
});
