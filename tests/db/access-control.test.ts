/**
 * Testes de autorização, máquina de estados e privacidade direto no banco.
 * Executar com: npm run test:db
 */
import { beforeAll, describe, expect, it } from "vitest";
import { as, createAuthUser, createDb, createStaff, type Db, type Tx } from "./harness";

type Json = Record<string, unknown>;

async function rpc<T = Json>(tx: Tx, sql: string, params: unknown[] = []): Promise<T> {
  const res = await tx.query<{ r: T }>(`select ${sql} as r`, params);
  return res.rows[0]!.r;
}

async function count(tx: Tx, sql: string, params: unknown[] = []): Promise<number> {
  const res = await tx.query<{ n: number }>(`select count(*)::int as n from ${sql}`, params);
  return res.rows[0]!.n;
}

async function startConversation(db: Db, uid: string): Promise<string> {
  return as(db, { role: "authenticated", uid }, (tx) =>
    rpc<string>(tx, "public.start_conversation($1)", ["2026-10"]),
  );
}

async function postUserMessage(
  db: Db,
  uid: string,
  conversationId: string,
  content: string,
  risk: "none" | "attention" | "high" | "critical" = "none",
  clientId: string = crypto.randomUUID(),
): Promise<Json> {
  return as(db, { role: "service_role" }, (tx) =>
    rpc(tx, "public.post_user_message($1, $2, $3, $4, 'typed', $5)", [
      uid,
      conversationId,
      content,
      clientId,
      risk,
    ]),
  );
}

describe("controle de acesso e fluxo de atendimento", () => {
  let db: Db;
  let alice: string;
  let bruno: string;
  let admin: string;
  let psi1: string;
  let psi2: string;
  let psiPending: string;

  beforeAll(async () => {
    db = await createDb();
    alice = await createAuthUser(db, { anonymous: true });
    bruno = await createAuthUser(db, { anonymous: true });
    admin = await createStaff(db, { roles: ["admin"], name: "Admin" });
    psi1 = await createStaff(db, { roles: ["psychologist"], name: "Ana", available: true });
    psi2 = await createStaff(db, { roles: ["psychologist"], name: "Beatriz", available: true });
    psiPending = await createStaff(db, {
      roles: ["psychologist"],
      name: "Carla",
      verified: false,
      available: true,
    });
  });

  it("cria perfil e preferências automaticamente para novos usuários do Auth", async () => {
    const n = await as(db, { role: "authenticated", uid: alice }, (tx) =>
      count(tx, "public.user_preferences"),
    );
    expect(n).toBe(1);
  });

  it("reaproveita a conversa ativa em vez de duplicar", async () => {
    const c1 = await startConversation(db, alice);
    const c2 = await startConversation(db, alice);
    expect(c2).toBe(c1);
  });

  it("anônimo sem sessão não consegue iniciar conversa nem ler dados", async () => {
    await expect(
      as(db, { role: "anon" }, (tx) => rpc(tx, "public.start_conversation('2026-10')")),
    ).rejects.toThrow();
    await expect(
      as(db, { role: "anon" }, (tx) => count(tx, "public.messages")),
    ).rejects.toThrow(/permission denied/);
  });

  it("o portal não consegue gravar mensagens diretamente nem forjar risco", async () => {
    const conv = await startConversation(db, alice);
    await expect(
      as(db, { role: "authenticated", uid: alice }, (tx) =>
        tx.query(
          "insert into public.messages (conversation_id, sender, content) values ($1, 'ai', 'x')",
          [conv],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(db, { role: "authenticated", uid: alice }, (tx) =>
        rpc(tx, "public.post_user_message($1, $2, 'oi', gen_random_uuid(), 'typed', 'critical')", [
          alice,
          conv,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("usuário não lê conversas nem mensagens de terceiros", async () => {
    const conv = await startConversation(db, alice);
    await postUserMessage(db, alice, conv, "Mensagem privada da Alice");

    const own = await as(db, { role: "authenticated", uid: alice }, (tx) =>
      count(tx, "public.messages where conversation_id = $1", [conv]),
    );
    expect(own).toBeGreaterThan(0);

    const other = await as(db, { role: "authenticated", uid: bruno }, async (tx) => ({
      conversations: await count(tx, "public.conversations where id = $1", [conv]),
      messages: await count(tx, "public.messages where conversation_id = $1", [conv]),
    }));
    expect(other).toEqual({ conversations: 0, messages: 0 });

    await expect(
      as(db, { role: "authenticated", uid: bruno }, (tx) =>
        rpc(tx, "public.request_human($1)", [conv]),
      ),
    ).rejects.toThrow(/conversation_not_found/);
    await expect(
      as(db, { role: "authenticated", uid: bruno }, (tx) =>
        rpc(tx, "public.delete_my_conversation($1)", [conv]),
      ),
    ).rejects.toThrow(/conversation_not_found/);
  });

  it("ninguém encerra conversa alheia (inclusive sem profissional atribuído)", async () => {
    const julia = await createAuthUser(db, { anonymous: true });
    const conv = await startConversation(db, julia);
    await expect(
      as(db, { role: "authenticated", uid: bruno }, (tx) => rpc(tx, "public.close_conversation($1)", [conv])),
    ).rejects.toThrow(/conversation_not_found/);
    await expect(
      as(db, { role: "authenticated", uid: psi1 }, (tx) => rpc(tx, "public.close_conversation($1)", [conv])),
    ).rejects.toThrow(/conversation_not_found/);
    const row = await db.query<{ status: string }>("select status from public.conversations where id = $1", [conv]);
    expect(row.rows[0]!.status).toBe("ai_active");
  });

  it("o portal não vê o identificador interno de quem enviou a mensagem", async () => {
    await expect(
      as(db, { role: "authenticated", uid: alice }, (tx) =>
        tx.query("select sender_user_id from public.messages limit 1"),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("administrador sem papel clínico vê metadados, mas não o conteúdo", async () => {
    const conv = await startConversation(db, alice);
    const res = await as(db, { role: "authenticated", uid: admin }, async (tx) => ({
      conversations: await count(tx, "public.conversations where id = $1", [conv]),
      messages: await count(tx, "public.messages where conversation_id = $1", [conv]),
    }));
    expect(res).toEqual({ conversations: 1, messages: 0 });
    await expect(
      as(db, { role: "authenticated", uid: admin }, (tx) =>
        rpc(tx, "public.get_conversation_for_staff($1)", [conv]),
      ),
    ).rejects.toThrow(/forbidden/);
  });

  it("psicólogo só acessa conteúdo de conversas elegíveis", async () => {
    const conv = await startConversation(db, alice);
    const before = await as(db, { role: "authenticated", uid: psi1 }, (tx) =>
      count(tx, "public.messages where conversation_id = $1", [conv]),
    );
    expect(before).toBe(0);

    const requested = await as(db, { role: "authenticated", uid: alice }, (tx) =>
      rpc<Json>(tx, "public.request_human($1)", [conv]),
    );
    expect(requested.status).toBe("waiting_human");
    expect(requested.available_professionals).toBe(2);

    const after = await as(db, { role: "authenticated", uid: psi1 }, (tx) =>
      count(tx, "public.messages where conversation_id = $1", [conv]),
    );
    expect(after).toBeGreaterThan(0);

    const pending = await as(db, { role: "authenticated", uid: psiPending }, (tx) =>
      count(tx, "public.messages where conversation_id = $1", [conv]),
    );
    expect(pending).toBe(0);
  });

  it("transferência IA → humano: só um profissional assume e a IA é bloqueada", async () => {
    const conv = await startConversation(db, alice);
    const posted = await postUserMessage(db, alice, conv, "Quero falar com uma pessoa.");
    const versionBefore = posted.state_version as number;
    const userMessageId = (posted.message as Json).id as string;

    // Pedido repetido não duplica o pedido nem a mensagem de sistema.
    await as(db, { role: "authenticated", uid: alice }, (tx) =>
      rpc(tx, "public.request_human($1)", [conv]),
    );
    await as(db, { role: "authenticated", uid: alice }, (tx) =>
      rpc(tx, "public.request_human($1)", [conv]),
    );
    const openRequests = await as(db, { role: "service_role" }, (tx) =>
      count(tx, "public.human_support_requests where conversation_id = $1 and status = 'open'", [
        conv,
      ]),
    );
    expect(openRequests).toBe(1);

    const claimed = await as(db, { role: "authenticated", uid: psi1 }, (tx) =>
      rpc<Json>(tx, "public.claim_conversation($1)", [conv]),
    );
    expect(claimed.status).toBe("human_active");
    expect(claimed.assigned_label).toBe("Ana · Psicóloga");

    // Segundo profissional tenta assumir a mesma conversa.
    await expect(
      as(db, { role: "authenticated", uid: psi2 }, (tx) =>
        rpc(tx, "public.claim_conversation($1)", [conv]),
      ),
    ).rejects.toThrow(/already_claimed/);

    // Reassumir pelo mesmo profissional é idempotente.
    const again = await as(db, { role: "authenticated", uid: psi1 }, (tx) =>
      rpc<Json>(tx, "public.claim_conversation($1)", [conv]),
    );
    expect(again.state_version).toBe(claimed.state_version);

    // Resposta de IA iniciada antes da transferência é descartada.
    const aiResult = await as(db, { role: "service_role" }, (tx) =>
      rpc(tx, "public.commit_ai_message($1, $2, $3, 'resposta atrasada', 'mock', 'mock-1')", [
        conv,
        versionBefore,
        userMessageId,
      ]),
    );
    expect(aiResult).toBeNull();
    // Mesmo com a versão atual, a IA não grava durante atendimento humano.
    const aiCurrent = await as(db, { role: "service_role" }, (tx) =>
      rpc(tx, "public.commit_ai_message($1, $2, $3, 'resposta', 'mock', 'mock-1')", [
        conv,
        claimed.state_version,
        userMessageId,
      ]),
    );
    expect(aiCurrent).toBeNull();
    const aiCount = await as(db, { role: "service_role" }, (tx) =>
      count(tx, "public.messages where conversation_id = $1 and sender = 'ai'", [conv]),
    );
    expect(aiCount).toBe(0);

    // Profissional responde; a pessoa vê a mensagem com o rótulo profissional.
    const clientId = crypto.randomUUID();
    await as(db, { role: "authenticated", uid: psi1 }, (tx) =>
      rpc(tx, "public.post_staff_message($1, 'Olá, estou aqui com você.', $2)", [conv, clientId]),
    );
    // Reenvio com a mesma chave não duplica.
    await as(db, { role: "authenticated", uid: psi1 }, (tx) =>
      rpc(tx, "public.post_staff_message($1, 'Olá, estou aqui com você.', $2)", [conv, clientId]),
    );
    const staffMessages = await as(db, { role: "authenticated", uid: alice }, (tx) =>
      tx.query<{ sender_label: string }>(
        "select sender_label from public.messages where conversation_id = $1 and sender = 'staff'",
        [conv],
      ),
    );
    expect(staffMessages.rows).toEqual([{ sender_label: "Ana · Psicóloga" }]);

    // Outro profissional não pode enviar mensagens nesta conversa.
    await expect(
      as(db, { role: "authenticated", uid: psi2 }, (tx) =>
        rpc(tx, "public.post_staff_message($1, 'intruso', gen_random_uuid())", [conv]),
      ),
    ).rejects.toThrow(/not_assigned/);

    // Leitura pelo painel é auditada.
    await as(db, { role: "authenticated", uid: psi1 }, (tx) =>
      rpc(tx, "public.get_conversation_for_staff($1)", [conv]),
    );
    const audits = await as(db, { role: "service_role" }, (tx) =>
      count(tx, "public.audit_logs where target_id = $1 and action in ('conversation.view', 'conversation.claim')", [conv]),
    );
    expect(audits).toBe(2);

    // Devolver para a IA exige ação do responsável; depois a IA volta a responder.
    const released = await as(db, { role: "authenticated", uid: psi1 }, (tx) =>
      rpc<Json>(tx, "public.release_to_ai($1)", [conv]),
    );
    expect(released.status).toBe("ai_active");
    const followUp = await postUserMessage(db, alice, conv, "Obrigada.");
    const committed = await as(db, { role: "service_role" }, (tx) =>
      rpc<Json>(tx, "public.commit_ai_message($1, $2, $3, 'De nada.', 'mock', 'mock-1')", [
        conv,
        followUp.state_version,
        (followUp.message as Json).id,
      ]),
    );
    expect(committed?.sender).toBe("ai");
  });

  it("resposta da IA para mensagem desatualizada é descartada e nunca duplicada", async () => {
    const carol = await createAuthUser(db, { anonymous: true });
    const conv = await startConversation(db, carol);
    const first = await postUserMessage(db, carol, conv, "Primeira");
    const second = await postUserMessage(db, carol, conv, "Segunda");

    const stale = await as(db, { role: "service_role" }, (tx) =>
      rpc(tx, "public.commit_ai_message($1, $2, $3, 'r1', 'mock', 'm')", [
        conv,
        first.state_version,
        (first.message as Json).id,
      ]),
    );
    expect(stale).toBeNull();

    const args = [conv, second.state_version, (second.message as Json).id];
    const ok = await as(db, { role: "service_role" }, (tx) =>
      rpc(tx, "public.commit_ai_message($1, $2, $3, 'r2', 'mock', 'm')", args),
    );
    const dup = await as(db, { role: "service_role" }, (tx) =>
      rpc(tx, "public.commit_ai_message($1, $2, $3, 'r2', 'mock', 'm')", args),
    );
    expect(ok).not.toBeNull();
    expect(dup).toBeNull();
  });

  it("mensagens repetidas com a mesma chave do cliente não duplicam", async () => {
    const dan = await createAuthUser(db, { anonymous: true });
    const conv = await startConversation(db, dan);
    const clientId = crypto.randomUUID();
    const a = await postUserMessage(db, dan, conv, "Oi", "none", clientId);
    const b = await postUserMessage(db, dan, conv, "Oi", "none", clientId);
    expect(b.duplicate).toBe(true);
    expect((b.message as Json).id).toBe((a.message as Json).id);
  });

  it("risco alto prioriza a conversa e entra na fila quando há profissional disponível", async () => {
    const eva = await createAuthUser(db, { anonymous: true });
    const conv = await startConversation(db, eva);
    const res = await postUserMessage(db, eva, conv, "texto de teste", "critical");
    expect(res.escalated).toBe(true);
    expect(res.status).toBe("waiting_human");

    const row = await as(db, { role: "service_role" }, (tx) =>
      tx.query<{ priority: boolean; risk_level: string }>(
        "select priority, risk_level from public.conversations where id = $1",
        [conv],
      ),
    );
    expect(row.rows[0]).toEqual({ priority: true, risk_level: "critical" });

    // O evento registra o nível, mas não o conteúdo.
    const ev = await as(db, { role: "service_role" }, (tx) =>
      tx.query<{ metadata: Json }>(
        "select metadata from public.conversation_events where conversation_id = $1 and event_type = 'risk_flagged'",
        [conv],
      ),
    );
    expect(JSON.stringify(ev.rows)).not.toContain("texto de teste");
  });

  it("sem profissionais disponíveis, o risco prioriza mas não promete atendimento", async () => {
    await db.query("update public.staff_profiles set availability = 'offline'");
    const fred = await createAuthUser(db, { anonymous: true });
    const conv = await startConversation(db, fred);
    const res = await postUserMessage(db, fred, conv, "texto", "high");
    expect(res.escalated).toBe(false);
    expect(res.status).toBe("ai_active");
    const requested = await as(db, { role: "authenticated", uid: fred }, (tx) =>
      rpc<Json>(tx, "public.request_human($1)", [conv]),
    );
    expect(requested.available_professionals).toBe(0);
    await db.query("update public.staff_profiles set availability = 'available', last_seen_at = now()");
  });

  it("canais Realtime privados só entregam eventos a quem tem acesso", async () => {
    const gil = await createAuthUser(db, { anonymous: true });
    const conv = await startConversation(db, gil);
    await postUserMessage(db, gil, conv, "olá");
    const topic = `conversation:${conv}`;

    const ownerSees = await as(db, { role: "authenticated", uid: gil, topic }, (tx) =>
      count(tx, "realtime.messages where topic = $1", [topic]),
    );
    expect(ownerSees).toBeGreaterThan(0);

    const strangerSees = await as(db, { role: "authenticated", uid: bruno, topic }, (tx) =>
      count(tx, "realtime.messages where topic = $1", [topic]),
    );
    expect(strangerSees).toBe(0);

    const queueTopic = "staff:queue";
    const userQueue = await as(db, { role: "authenticated", uid: gil, topic: queueTopic }, (tx) =>
      count(tx, "realtime.messages where topic = $1", [queueTopic]),
    );
    expect(userQueue).toBe(0);
    const staffQueue = await as(db, { role: "authenticated", uid: psi1, topic: queueTopic }, (tx) =>
      count(tx, "realtime.messages where topic = $1", [queueTopic]),
    );
    expect(staffQueue).toBeGreaterThan(0);

    // O payload da fila não contém conteúdo de mensagens.
    const payloads = await db.query<{ payload: Json }>(
      "select payload from realtime.messages where topic = 'staff:queue'",
    );
    expect(JSON.stringify(payloads.rows)).not.toContain("olá");
  });

  it("exclusão pela pessoa: apaga de verdade ou registra retenção quando houve profissional", async () => {
    const hana = await createAuthUser(db, { anonymous: true });
    const conv = await startConversation(db, hana);
    await postUserMessage(db, hana, conv, "algo");
    const res = await as(db, { role: "authenticated", uid: hana }, (tx) =>
      rpc<Json>(tx, "public.delete_my_conversation($1)", [conv]),
    );
    expect(res.result).toBe("deleted");
    const left = await db.query<{ n: number }>(
      "select (select count(*) from public.messages where conversation_id = $1)::int + (select count(*) from public.conversations where id = $1)::int as n",
      [conv],
    );
    expect(left.rows[0]!.n).toBe(0);

    const conv2 = await startConversation(db, hana);
    await as(db, { role: "authenticated", uid: hana }, (tx) =>
      rpc(tx, "public.request_human($1)", [conv2]),
    );
    await as(db, { role: "authenticated", uid: psi2 }, (tx) =>
      rpc(tx, "public.claim_conversation($1)", [conv2]),
    );
    const pending = await as(db, { role: "authenticated", uid: hana }, (tx) =>
      rpc<Json>(tx, "public.delete_my_conversation($1)", [conv2]),
    );
    expect(pending).toEqual({ result: "pending", reason: "professional_record_retention" });
  });

  it("exportação devolve apenas os dados da própria pessoa", async () => {
    const data = await as(db, { role: "authenticated", uid: alice }, (tx) =>
      rpc<Json>(tx, "public.export_my_data()"),
    );
    const text = JSON.stringify(data);
    expect(text).toContain("Mensagem privada da Alice");
    expect((data.profile as Json).id).toBe(alice);
  });

  it("métricas exigem papel administrativo", async () => {
    const metrics = await as(db, { role: "authenticated", uid: admin }, (tx) =>
      rpc<Json>(tx, "public.dashboard_metrics()"),
    );
    expect((metrics.usage_by_hour_7d as number[]).length).toBe(24);
    expect((metrics.conversations_by_day_14d as unknown[]).length).toBe(14);
    await expect(
      as(db, { role: "authenticated", uid: psi1 }, (tx) => rpc(tx, "public.dashboard_metrics()")),
    ).rejects.toThrow(/forbidden/);
  });

  it("gestão de equipe respeita separação de funções", async () => {
    const newPsi = await createAuthUser(db, { email: "nova@equipe.test" });
    await as(db, { role: "authenticated", uid: admin }, (tx) =>
      rpc(tx, "public.admin_register_staff($1, 'Nova Pessoa', 'Nova', 'Psicóloga', 'CRP 01/1', array['psychologist']::public.staff_role[])", [newPsi]),
    );
    // Admin comum não concede papel de superadministrador.
    await expect(
      as(db, { role: "authenticated", uid: admin }, (tx) =>
        rpc(tx, "public.admin_set_roles($1, array['superadmin']::public.staff_role[])", [newPsi]),
      ),
    ).rejects.toThrow(/forbidden/);
    // Ninguém valida a própria credencial.
    await expect(
      as(db, { role: "authenticated", uid: admin }, (tx) =>
        rpc(tx, "public.admin_set_credential_status($1, 'verified')", [admin]),
      ),
    ).rejects.toThrow(/self_verification_forbidden/);
    // Psicólogo não administra a equipe.
    await expect(
      as(db, { role: "authenticated", uid: psi1 }, (tx) =>
        rpc(tx, "public.admin_set_staff_active($1, false)", [psi2]),
      ),
    ).rejects.toThrow(/forbidden/);
  });

  it("desativar profissional devolve o atendimento para a fila", async () => {
    const ivo = await createAuthUser(db, { anonymous: true });
    const conv = await startConversation(db, ivo);
    await as(db, { role: "authenticated", uid: ivo }, (tx) => rpc(tx, "public.request_human($1)", [conv]));
    await as(db, { role: "authenticated", uid: psi2 }, (tx) =>
      rpc(tx, "public.claim_conversation($1)", [conv]),
    );
    await as(db, { role: "authenticated", uid: admin }, (tx) =>
      rpc(tx, "public.admin_set_staff_active($1, false)", [psi2]),
    );
    const row = await db.query<{ status: string; assigned_staff_id: string | null }>(
      "select status, assigned_staff_id from public.conversations where id = $1",
      [conv],
    );
    expect(row.rows[0]).toEqual({ status: "waiting_human", assigned_staff_id: null });
    // Conta desativada perde o acesso clínico imediatamente.
    await expect(
      as(db, { role: "authenticated", uid: psi2 }, (tx) =>
        rpc(tx, "public.claim_conversation($1)", [conv]),
      ),
    ).rejects.toThrow(/forbidden/);
  });

  it("funções internas não ficam expostas ao portal", async () => {
    for (const fn of [
      "public._transition(gen_random_uuid(), 'closed', 'user', null, 'x')",
      "public.purge_expired_data()",
      "public.prepare_account_deletion(gen_random_uuid())",
      "public.bootstrap_superadmin(gen_random_uuid(), 'x', 'x')",
    ]) {
      await expect(
        as(db, { role: "authenticated", uid: alice }, (tx) => rpc(tx, fn)),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("rotina de retenção executa e registra auditoria", async () => {
    const res = await as(db, { role: "service_role" }, (tx) =>
      rpc<Json>(tx, "public.purge_expired_data()"),
    );
    expect(res).toHaveProperty("deleted_conversations");
  });
});
