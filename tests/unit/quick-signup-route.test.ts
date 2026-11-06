// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { displayNameFromEmail } from "@/lib/staff-signup-mode";

const createUser = vi.fn();
const deleteUser = vi.fn();
const inserts: { table: string; row: Record<string, unknown> }[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  getAdminSupabase: () => ({
    auth: { admin: { createUser, deleteUser } },
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return { error: null };
      },
    }),
  }),
}));

function request(body: unknown) {
  return new NextRequest("http://localhost/api/dashboard/signup", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost", host: "localhost" },
    body: JSON.stringify(body),
  });
}

async function post(body: unknown) {
  const { POST } = await import("@/app/api/dashboard/signup/route");
  return POST(request(body));
}

describe("cadastro simplificado de psicólogo (modo de teste)", () => {
  beforeEach(() => {
    createUser.mockReset();
    deleteUser.mockReset();
    inserts.length = 0;
  });
  afterEach(() => {
    delete process.env.STAFF_OPEN_SIGNUP;
  });

  it("fica desativado sem STAFF_OPEN_SIGNUP=true", async () => {
    const res = await post({ email: "ana@gmail.com", password: "12345678" });
    expect(res.status).toBe(404);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("cria conta confirmada e psicólogo já liberado", async () => {
    process.env.STAFF_OPEN_SIGNUP = "true";
    createUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const res = await post({ email: "Ana.Souza92@Gmail.com", password: "12345678" });
    expect(res.status).toBe(200);
    expect(createUser).toHaveBeenCalledWith({ email: "ana.souza92@gmail.com", password: "12345678", email_confirm: true });
    expect(inserts.find((i) => i.table === "staff_profiles")?.row).toMatchObject({
      user_id: "u1",
      display_name: "Ana Souza",
      credential_status: "verified",
    });
    expect(inserts.find((i) => i.table === "staff_roles")?.row).toEqual({ user_id: "u1", role: "psychologist" });
  });

  it("e-mail já cadastrado devolve 409", async () => {
    process.env.STAFF_OPEN_SIGNUP = "true";
    createUser.mockResolvedValue({ data: { user: null }, error: { message: "A user with this email address has already been registered", status: 422 } });
    const res = await post({ email: "ana@gmail.com", password: "12345678" });
    expect(res.status).toBe(409);
  });

  it("valida e-mail e tamanho da senha", async () => {
    process.env.STAFF_OPEN_SIGNUP = "true";
    expect((await post({ email: "nao-e-email", password: "12345678" })).status).toBe(400);
    expect((await post({ email: "ana@gmail.com", password: "123" })).status).toBe(400);
    expect(createUser).not.toHaveBeenCalled();
  });
});

describe("nome exibido a partir do e-mail", () => {
  it.each([
    ["ana.souza92@gmail.com", "Ana Souza"],
    ["joao_pedro@gmail.com", "Joao Pedro"],
    ["x@gmail.com", "Profissional"],
    ["12345@gmail.com", "Profissional"],
  ])("%s → %s", (email, name) => {
    expect(displayNameFromEmail(email)).toBe(name);
  });
});
