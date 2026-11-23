/**
 * Sem etapa prévia, a conversa é criada pela primeira ação da pessoa. Pedir
 * uma pessoa e enviar a frase no mesmo instante (fluxo de toques) deve criar
 * UMA conversa só.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChat } from "@/features/chat/use-chat";

const CONV = "11111111-1111-4111-8111-111111111111";
const rpc = vi.fn();

/** Encadeamento mínimo do cliente Supabase (select/eq/order/limit…), aguardável. */
function query(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) chain[m] = () => chain;
  chain.single = chain.maybeSingle = () => Promise.resolve(result);
  chain.then = (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) => Promise.resolve(result).then(ok, fail);
  return chain;
}

vi.mock("@/lib/supabase/client", () => ({
  ensureVisitorSession: vi.fn(async () => "visitante"),
  getBrowserSupabase: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: (table: string) =>
      table === "conversations"
        ? query({
            data: { id: CONV, status: "ai_active", state_version: 1, assigned_label: null, risk_level: "none" },
            error: null,
          })
        : query({ data: [], error: null }),
    rpc,
    realtime: { setAuth: async () => undefined },
    channel: () => {
      const channel = { on: () => channel, subscribe: () => channel };
      return channel;
    },
    removeChannel: async () => undefined,
  }),
}));
vi.mock("@/lib/preferences/preferences-provider", () => ({ syncPreferencesToAccount: async () => undefined }));

const fetchMock = vi.fn(async (url: string) =>
  url === "/api/conversations"
    ? Response.json({ conversationId: CONV })
    : Response.json({ error: { message: "indisponível" } }, { status: 503 }),
);

describe("início da conversa no primeiro toque", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: { status: "waiting_human", state_version: 2, available_professionals: 0 }, error: null });
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("pedir uma pessoa e enviar a frase ao mesmo tempo cria uma conversa só", async () => {
    const { result } = renderHook(() => useChat());
    await waitFor(() => expect(result.current.state.phase).toBe("new"));

    await act(async () => {
      await Promise.all([result.current.requestHuman(), result.current.send("Quero falar com uma pessoa.", "guided")]);
    });

    const starts = fetchMock.mock.calls.filter(([url]) => url === "/api/conversations");
    expect(starts).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith("request_human", { p_conversation_id: CONV });
    expect(fetchMock).toHaveBeenCalledWith(`/api/conversations/${CONV}/messages`, expect.anything());
    expect(result.current.state.conversationId).toBe(CONV);
  });
});
