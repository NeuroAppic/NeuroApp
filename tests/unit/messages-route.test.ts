// @vitest-environment node
/**
 * Fluxo do servidor para POST /api/conversations/[id]/messages com Supabase
 * e IA simulados (nenhuma API paga é chamada).
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readEventStream, type ChatStreamEvent } from "@/lib/chat/protocol";

const CONV = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";

const rpc = vi.fn();
const fromCalls: string[] = [];
// Conteúdo da última mensagem "gravada": o histórico lido do banco a inclui.
let lastContent = "";

function queryBuilder(table: string) {
  fromCalls.push(table);
  const history = [{ id: "m1", conversation_id: CONV, sender: "user", content: lastContent, created_at: new Date().toISOString() }];
  const result = { data: table === "messages" ? history : null, error: null, count: 0 };
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "order", "limit", "in"]) builder[m] = () => builder;
  builder.maybeSingle = async () => ({ data: null, error: null });
  builder.single = async () => ({ data: null, error: null });
  builder.insert = async () => ({ error: null });
  builder.then = (resolve: (v: unknown) => void) => resolve(result);
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  getAdminSupabase: () => ({ rpc, from: queryBuilder }),
}));
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: { id: USER } } }) } }),
}));

process.env.AI_PROVIDER = "mock";

function request(content: string) {
  return new NextRequest(`http://localhost/api/conversations/${CONV}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost", host: "localhost" },
    body: JSON.stringify({ content, clientMessageId: crypto.randomUUID(), source: "quick" }),
  });
}

async function run(content: string): Promise<{ status: number; events: ChatStreamEvent[] }> {
  lastContent = content;
  const { POST } = await import("@/app/api/conversations/[id]/messages/route");
  const response = await POST(request(content), { params: Promise.resolve({ id: CONV }) } as never);
  const events: ChatStreamEvent[] = [];
  if (response.body && response.status === 200) await readEventStream(response.body, (e) => events.push(e));
  return { status: response.status, events };
}

function posted(status: string, version = 1) {
  return {
    data: {
      message: { id: "m1", conversation_id: CONV, sender: "user", content: "x", client_message_id: "c", created_at: new Date().toISOString() },
      status,
      state_version: version,
      escalated: false,
      duplicate: false,
    },
    error: null,
  };
}

beforeEach(() => {
  rpc.mockReset();
  fromCalls.length = 0;
});

describe("rota de mensagens", () => {
  it("grava a mensagem rápida, transmite a resposta e grava a IA condicionada à versão", async () => {
    rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "post_user_message") return posted("ai_active", 7);
      if (fn === "available_clinicians_count") return { data: 0, error: null };
      if (fn === "commit_ai_message") {
        expect(args.p_expected_version).toBe(7);
        expect(args.p_reply_to).toBe("m1");
        return { data: { id: "a1", sender: "ai", conversation_id: CONV, content: args.p_content }, error: null };
      }
      return { data: null, error: null };
    });
    const { status, events } = await run("Estou em crise.");
    expect(status).toBe(200);
    expect(events[0]!.type).toBe("user_message");
    expect(events.some((e) => e.type === "delta")).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "ai_message" });
    // A mensagem da pessoa é gravada antes de qualquer chamada à IA.
    expect(rpc.mock.calls[0]![0]).toBe("post_user_message");
  });

  it("não chama a IA quando um profissional está na conversa", async () => {
    rpc.mockImplementation(async (fn: string) => (fn === "post_user_message" ? posted("human_active") : { data: 0, error: null }));
    const { events } = await run("Oi");
    expect(events.map((e) => e.type)).toEqual(["user_message", "ai_skipped"]);
    expect(rpc.mock.calls.some(([fn]) => fn === "commit_ai_message")).toBe(false);
  });

  it("descarta a resposta se o estado mudou durante a geração", async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "post_user_message") return posted("ai_active");
      if (fn === "commit_ai_message") return { data: null, error: null };
      return { data: 0, error: null };
    });
    const { events } = await run("Oi");
    expect(events.at(-1)).toEqual({ type: "discarded", reason: "state_changed" });
  });

  it("IA indisponível: a mensagem já está salva e a pessoa recebe alternativa", async () => {
    rpc.mockImplementation(async (fn: string) => (fn === "post_user_message" ? posted("ai_active") : { data: 0, error: null }));
    const { events } = await run("[[falha]] quero morrer");
    expect(events[0]!.type).toBe("user_message");
    expect(events.find((e) => e.type === "safety")).toMatchObject({ level: "high" });
    const unavailable = events.find((e) => e.type === "ai_unavailable");
    expect(unavailable).toMatchObject({ retryable: true });
    expect(JSON.stringify(unavailable)).toContain("188");
    expect(fromCalls).toContain("ai_usage");
  });

  it("o risco é classificado no servidor e enviado ao banco sem depender do cliente", async () => {
    rpc.mockImplementation(async (fn: string) => (fn === "post_user_message" ? posted("ai_active") : { data: 0, error: null }));
    await run("Vou me matar hoje");
    const [, args] = rpc.mock.calls.find(([fn]) => fn === "post_user_message")!;
    expect(args).toMatchObject({ p_risk_level: "critical", p_input_source: "quick", p_user_id: USER });
  });

  it("rejeita origem externa (CSRF) e mensagens inválidas", async () => {
    const { POST } = await import("@/app/api/conversations/[id]/messages/route");
    const evil = new NextRequest(`http://localhost/api/conversations/${CONV}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://malicioso.example", host: "localhost" },
      body: "{}",
    });
    expect((await POST(evil, { params: Promise.resolve({ id: CONV }) } as never)).status).toBe(403);
    const { status } = await run("   ");
    expect(status).toBe(400);
  });
});
