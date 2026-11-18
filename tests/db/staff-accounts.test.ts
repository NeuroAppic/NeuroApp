/**
 * Contas de psicólogos criadas pelo administrador: sem CRP, sem credencial
 * pendente, com acesso imediato aos atendimentos. Ninguém vira equipe sozinho.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { as, createAuthUser, createDb, createStaff, type Db } from "./harness";

describe("contas da equipe criadas pelo administrador", () => {
  let db: Db;
  let admin: string;
  let otherPsi: string;

  beforeAll(async () => {
    db = await createDb();
    admin = await createStaff(db, { roles: ["admin"], name: "Admin" });
    otherPsi = await createStaff(db, { roles: ["psychologist"], name: "Outra" });
  });

  async function waitingConversation(): Promise<string> {
    const person = await createAuthUser(db, { anonymous: true });
    return as(db, { role: "authenticated", uid: person }, async (tx) => {
      const id = (await tx.query<{ r: string }>("select public.start_conversation('2026-10') as r")).rows[0]!.r;
      await tx.query("select public.request_human($1)", [id]);
      return id;
    });
  }

  it("o banco não tem mais registro profissional nem credencial", async () => {
    const cols = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'staff_profiles'",
    );
    const names = cols.rows.map((r) => r.column_name);
    expect(names).not.toContain("professional_registry");
    expect(names).not.toContain("credential_status");
  });

  it("psicólogo cadastrado pelo administrador já pode ler e assumir a fila", async () => {
    const psi = await createAuthUser(db, { email: "nova@equipe.test" });
    await as(db, { role: "authenticated", uid: admin }, (tx) =>
      tx.query("select public.admin_register_staff($1, 'Nova', array['psychologist']::public.staff_role[])", [psi]),
    );
    const conv = await waitingConversation();

    const reads = await as(db, { role: "authenticated", uid: psi }, async (tx) =>
      (await tx.query<{ n: number }>("select count(*)::int as n from public.messages where conversation_id = $1", [conv])).rows[0]!.n,
    );
    expect(reads).toBeGreaterThan(0);
    const claimed = await as(db, { role: "authenticated", uid: psi }, async (tx) =>
      (await tx.query<{ r: { status: string; assigned_label: string } }>("select public.claim_conversation($1) as r", [conv])).rows[0]!.r,
    );
    expect(claimed).toMatchObject({ status: "human_active", assigned_label: "Nova" });

    // Devolver para a IA também funciona sem nenhuma etapa extra.
    const released = await as(db, { role: "authenticated", uid: psi }, async (tx) =>
      (await tx.query<{ r: { status: string } }>("select public.release_to_ai($1) as r", [conv])).rows[0]!.r,
    );
    expect(released.status).toBe("ai_active");

    const audit = await db.query<{ n: number }>(
      "select count(*)::int as n from public.audit_logs where action = 'staff.register' and target_id = $1",
      [psi],
    );
    expect(audit.rows[0]!.n).toBe(1);
  });

  it("só administradores criam contas da equipe", async () => {
    const someone = await createAuthUser(db, { email: "alguem@equipe.test" });
    await expect(
      as(db, { role: "authenticated", uid: otherPsi }, (tx) =>
        tx.query("select public.admin_register_staff($1, 'Alguém', array['psychologist']::public.staff_role[])", [someone]),
      ),
    ).rejects.toThrow(/forbidden/);
    await expect(
      as(db, { role: "authenticated", uid: someone }, (tx) =>
        tx.query("select public.admin_register_staff($1, 'Eu mesmo', array['psychologist']::public.staff_role[])", [someone]),
      ),
    ).rejects.toThrow(/forbidden/);
  });

  it("metadados de cadastro nunca criam conta da equipe (autocadastro removido)", async () => {
    const uid = await createAuthUser(db, {
      email: "esperto@teste.example",
      metadata: { staff_signup: { full_name: "Esperto", display_name: "Esperto", professional_registry: "CRP 1/1" } },
    });
    const staff = await db.query("select 1 from public.staff_profiles where user_id = $1", [uid]);
    expect(staff.rows).toHaveLength(0);
  });

  it("validação manual de credencial deixou de existir", async () => {
    const fn = await db.query("select 1 from pg_proc where proname = 'admin_set_credential_status'");
    expect(fn.rows).toHaveLength(0);
  });

  it("nome exibido é obrigatório e limitado", async () => {
    const u = await createAuthUser(db, { email: "semnome@equipe.test" });
    await expect(
      as(db, { role: "authenticated", uid: admin }, (tx) =>
        tx.query("select public.admin_register_staff($1, ' ', array['psychologist']::public.staff_role[])", [u]),
      ),
    ).rejects.toThrow(/invalid_display_name/);
  });
});
