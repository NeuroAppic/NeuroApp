/**
 * Autocadastro de profissionais: sempre psicólogo, sempre pendente,
 * sem acesso a conversas até a validação administrativa.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { as, createAuthUser, createDb, createStaff, type Db } from "./harness";

const signup = {
  full_name: "Maria Teste",
  display_name: "Maria",
  professional_title: "Psicóloga",
  professional_registry: "CRP 06/999999",
};

describe("autocadastro de profissional", () => {
  let db: Db;
  let admin: string;

  beforeAll(async () => {
    db = await createDb();
    admin = await createStaff(db, { roles: ["admin"], name: "Admin" });
  });

  async function staffRow(uid: string) {
    const res = await db.query<{ credential_status: string; roles: string[] }>(
      `select sp.credential_status, array_agg(sr.role::text) as roles
       from public.staff_profiles sp join public.staff_roles sr on sr.user_id = sp.user_id
       where sp.user_id = $1 group by sp.credential_status`,
      [uid],
    );
    return res.rows[0] ?? null;
  }

  it("cria psicólogo com credencial pendente", async () => {
    const uid = await createAuthUser(db, { email: "maria@teste.example", metadata: { staff_signup: signup } });
    expect(await staffRow(uid)).toEqual({ credential_status: "pending", roles: ["psychologist"] });
  });

  it("ignora tentativa de se dar papel administrativo ou credencial validada", async () => {
    const uid = await createAuthUser(db, {
      email: "esperto@teste.example",
      metadata: { staff_signup: { ...signup, role: "superadmin", roles: ["admin"], credential_status: "verified" } },
    });
    expect(await staffRow(uid)).toEqual({ credential_status: "pending", roles: ["psychologist"] });
  });

  it("não cria perfil profissional para visitante anônimo nem com dados inválidos", async () => {
    const anon = await createAuthUser(db, { anonymous: true, metadata: { staff_signup: signup } });
    const invalid = await createAuthUser(db, {
      email: "semcrp@teste.example",
      metadata: { staff_signup: { ...signup, professional_registry: "" } },
    });
    expect(await staffRow(anon)).toBeNull();
    expect(await staffRow(invalid)).toBeNull();
  });

  it("pendente não lê nem assume conversas; depois da validação, pode", async () => {
    const psi = await createAuthUser(db, { email: "nova@teste.example", metadata: { staff_signup: signup } });
    const person = await createAuthUser(db, { anonymous: true });
    const conv = await as(db, { role: "authenticated", uid: person }, async (tx) => {
      const id = (await tx.query<{ r: string }>("select public.start_conversation('2026-10') as r")).rows[0]!.r;
      await tx.query("select public.request_human($1)", [id]);
      return id;
    });

    const pendingReads = await as(db, { role: "authenticated", uid: psi }, async (tx) =>
      (await tx.query<{ n: number }>("select count(*)::int as n from public.messages where conversation_id = $1", [conv])).rows[0]!.n,
    );
    expect(pendingReads).toBe(0);
    await expect(
      as(db, { role: "authenticated", uid: psi }, (tx) => tx.query("select public.claim_conversation($1)", [conv])),
    ).rejects.toThrow(/forbidden/);

    await as(db, { role: "authenticated", uid: admin }, (tx) =>
      tx.query("select public.admin_set_credential_status($1, 'verified')", [psi]),
    );
    const claimed = await as(db, { role: "authenticated", uid: psi }, async (tx) =>
      (await tx.query<{ r: { status: string } }>("select public.claim_conversation($1) as r", [conv])).rows[0]!.r,
    );
    expect(claimed.status).toBe("human_active");
  });
});
