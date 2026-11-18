// @vitest-environment node
/**
 * POST /api/dashboard/staff: o administrador cria a conta do psicólogo com
 * e-mail e senha; a conta nasce confirmada e registrada na equipe.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.fn();
const createUser = vi.fn();
const deleteUser = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/auth/dal", () => ({ getStaffSession: () => session() }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: () => ({ auth: { admin: { createUser, deleteUser } } }) }));
vi.mock("@/lib/supabase/server", () => ({ getServerSupabase: async () => ({ rpc }) }));

async function post(body: unknown, origin = "http://localhost") {
  const { POST } = await import("@/app/api/dashboard/staff/route");
  return POST(
    new NextRequest("http://localhost/api/dashboard/staff", {
      method: "POST",
      headers: { "content-type": "application/json", origin, host: "localhost" },
      body: JSON.stringify(body),
    }),
  );
}

describe("cadastro de psicólogo pelo administrador", () => {
  beforeEach(() => {
    for (const fn of [session, createUser, deleteUser, rpc]) fn.mockReset();
    session.mockResolvedValue({ isAdmin: true, isSuperadmin: false });
    createUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    rpc.mockResolvedValue({ error: null });
  });

  it("cria a conta já confirmada e registra como psicólogo (nome vindo do e-mail)", async () => {
    const res = await post({ email: "Ana.Souza@Gmail.com", password: "12345678" });
    expect(res.status).toBe(200);
    expect(createUser).toHaveBeenCalledWith({ email: "ana.souza@gmail.com", password: "12345678", email_confirm: true });
    expect(rpc).toHaveBeenCalledWith("admin_register_staff", {
      p_user_id: "u1",
      p_display_name: "Ana Souza",
      p_roles: ["psychologist"],
    });
  });

  it("usa o nome exibido informado", async () => {
    await post({ email: "x@gmail.com", password: "12345678", displayName: "Dra. Ana" });
    expect(rpc.mock.calls[0]![1]).toMatchObject({ p_display_name: "Dra. Ana" });
  });

  it("só administradores cadastram; admin comum não cria administradores", async () => {
    session.mockResolvedValue({ isAdmin: false, isSuperadmin: false });
    expect((await post({ email: "a@gmail.com", password: "12345678" })).status).toBe(403);
    session.mockResolvedValue({ isAdmin: true, isSuperadmin: false });
    expect((await post({ email: "a@gmail.com", password: "12345678", roles: ["admin"] })).status).toBe(403);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("e-mail já cadastrado devolve 409; falha no registro desfaz a conta", async () => {
    createUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 422, message: "already been registered" } });
    expect((await post({ email: "a@gmail.com", password: "12345678" })).status).toBe(409);

    rpc.mockResolvedValueOnce({ error: { message: "forbidden" } });
    expect((await post({ email: "b@gmail.com", password: "12345678" })).status).toBe(400);
    expect(deleteUser).toHaveBeenCalledWith("u1");
  });

  it("rejeita dados inválidos e origem externa", async () => {
    expect((await post({ email: "nao-e-email", password: "12345678" })).status).toBe(400);
    expect((await post({ email: "a@gmail.com", password: "123" })).status).toBe(400);
    expect((await post({ email: "a@gmail.com", password: "12345678" }, "https://malicioso.example")).status).toBe(403);
  });
});
