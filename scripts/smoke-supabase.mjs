#!/usr/bin/env node
/**
 * Teste de fumaça contra um projeto Supabase REAL (não use em produção com pessoas reais).
 *
 *   node --env-file=.env.local scripts/smoke-supabase.mjs
 *
 * Cria usuários temporários (pessoa, intruso e psicóloga), percorre o fluxo
 * conversa → pedido humano → profissional assume → mensagens em tempo real,
 * verifica a autorização dos canais privados e APAGA tudo ao final.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !publishable || !secret) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY e SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const created = { users: [], conversations: [] };
const results = [];

function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function makeUser(label, metadata) {
  const email = `acolher-teste-${label}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const password = `T${crypto.randomUUID()}!`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: metadata,
  });
  if (error) throw new Error(`createUser ${label}: ${error.message}`);
  created.users.push(data.user.id);
  const client = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn ${label}: ${signInError.message}`);
  return { id: data.user.id, client };
}

/** Assina um canal privado e devolve os eventos recebidos + status da assinatura. */
async function listen(client, topic) {
  await client.realtime.setAuth();
  const events = [];
  const channel = client.channel(topic, { config: { private: true } });
  channel.on("broadcast", { event: "*" }, (msg) => events.push(msg));
  const status = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve("TIMEOUT"), 10_000);
    channel.subscribe((s) => {
      if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
        clearTimeout(timer);
        resolve(s);
      }
    });
  });
  return { channel, events, status };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const person = await makeUser("pessoa");
  const stranger = await makeUser("intruso");
  const psi = await makeUser("psi");

  // Psicóloga validada e disponível (equivalente ao fluxo do painel).
  await admin.from("staff_profiles").insert({
    user_id: psi.id, full_name: "Teste Psicóloga", display_name: "Teste", professional_title: "Psicóloga",
    professional_registry: "CRP 00/000000", credential_status: "verified", availability: "available",
    last_seen_at: new Date().toISOString(),
  });
  await admin.from("staff_roles").insert({ user_id: psi.id, role: "psychologist" });

  const { data: convId, error: startError } = await person.client.rpc("start_conversation", { p_policy_version: "2026-10" });
  check("pessoa inicia conversa", !startError && !!convId, startError?.message);
  created.conversations.push(convId);
  const topic = `conversation:${convId}`;

  const personSub = await listen(person.client, topic);
  check("pessoa assina o canal privado da própria conversa", personSub.status === "SUBSCRIBED", personSub.status);
  const strangerSub = await listen(stranger.client, topic);
  const staffQueueByPerson = await listen(person.client, "staff:queue");

  const { data: posted, error: postError } = await admin.rpc("post_user_message", {
    p_user_id: person.id, p_conversation_id: convId, p_content: "Mensagem de teste automatizado",
    p_client_message_id: crypto.randomUUID(), p_input_source: "typed", p_risk_level: "none", p_risk_rules: [],
  });
  check("servidor grava a mensagem da pessoa", !postError && posted?.message?.id, postError?.message);

  const { data: strangerRead } = await stranger.client.from("messages").select("id").eq("conversation_id", convId);
  check("intruso não lê as mensagens pelo banco", (strangerRead ?? []).length === 0);

  const { data: requested, error: reqError } = await person.client.rpc("request_human", { p_conversation_id: convId });
  check("pessoa pede atendimento humano", requested?.status === "waiting_human", reqError?.message);
  check("disponibilidade real informada", requested?.available_professionals >= 1, `disponíveis: ${requested?.available_professionals}`);

  const psiQueue = await listen(psi.client, "staff:queue");
  check("psicóloga assina a fila privada", psiQueue.status === "SUBSCRIBED", psiQueue.status);
  const psiSub = await listen(psi.client, topic);

  const { data: claimed, error: claimError } = await psi.client.rpc("claim_conversation", { p_conversation_id: convId });
  check("psicóloga assume a conversa", claimed?.status === "human_active", claimError?.message);

  const { error: staffMsgError } = await psi.client.rpc("post_staff_message", {
    p_conversation_id: convId, p_content: "Olá, sou da equipe (teste).", p_client_message_id: crypto.randomUUID(),
  });
  check("psicóloga responde", !staffMsgError, staffMsgError?.message);

  const { data: lateAi } = await admin.rpc("commit_ai_message", {
    p_conversation_id: convId, p_expected_version: posted.state_version, p_reply_to: posted.message.id,
    p_content: "resposta atrasada", p_provider: "smoke", p_model: "smoke",
  });
  check("resposta atrasada da IA é descartada após a transferência", lateAi === null);

  await wait(3000);
  const personEvents = personSub.events.map((e) => e.event);
  check("pessoa recebeu em tempo real a mudança para humano", personSub.events.some((e) => e.event === "conversation_updated" && e.payload?.status === "human_active"));
  check("pessoa recebeu em tempo real a mensagem da profissional", personSub.events.some((e) => e.payload?.message?.sender === "staff"), personEvents.join(","));
  check("payload em tempo real não expõe sender_user_id", !JSON.stringify(personSub.events).includes("sender_user_id"));
  check("intruso não recebeu nada do canal alheio", strangerSub.events.length === 0, `status ${strangerSub.status}, ${strangerSub.events.length} eventos`);
  check("pessoa não recebe a fila da equipe", staffQueueByPerson.events.length === 0, `${staffQueueByPerson.events.length} eventos`);
  check("fila da equipe recebeu atualização sem conteúdo", psiQueue.events.length > 0 && !JSON.stringify(psiQueue.events).includes("Mensagem de teste"));
  check("psicóloga assina o canal da conversa elegível", psiSub.status === "SUBSCRIBED", psiSub.status);

  for (const sub of [personSub, strangerSub, staffQueueByPerson, psiQueue, psiSub]) await sub.channel.unsubscribe();

  // --- Autocadastro de profissional (/dashboard/cadastro) -------------------
  const signupPsi = await makeUser("cadastro", {
    staff_signup: {
      full_name: "Teste Cadastro", display_name: "Cadastro", professional_title: "Psicóloga",
      professional_registry: "CRP 00/111111", role: "superadmin",
    },
  });
  const { data: signupProfile } = await admin
    .from("staff_profiles").select("credential_status").eq("user_id", signupPsi.id).maybeSingle();
  const { data: signupRoles } = await admin.from("staff_roles").select("role").eq("user_id", signupPsi.id);
  check("autocadastro cria psicólogo pendente", signupProfile?.credential_status === "pending");
  check("autocadastro nunca concede papel administrativo",
    JSON.stringify((signupRoles ?? []).map((r) => r.role)) === JSON.stringify(["psychologist"]));

  const { data: conv2 } = await person.client.rpc("start_conversation", { p_policy_version: "2026-10" });
  created.conversations.push(conv2);
  await person.client.rpc("close_conversation", { p_conversation_id: convId });
  const { data: conv3 } = await person.client.rpc("start_conversation", { p_policy_version: "2026-10" });
  created.conversations.push(conv3);
  await person.client.rpc("request_human", { p_conversation_id: conv3 });
  const { error: pendingClaim } = await signupPsi.client.rpc("claim_conversation", { p_conversation_id: conv3 });
  check("psicólogo pendente não assume conversas", !!pendingClaim && pendingClaim.message.includes("forbidden"));
  const { data: pendingRead } = await signupPsi.client.from("messages").select("id").eq("conversation_id", conv3);
  check("psicólogo pendente não lê conversas na fila", (pendingRead ?? []).length === 0);
}

async function cleanup() {
  for (const id of created.conversations.filter(Boolean)) await admin.from("conversations").delete().eq("id", id);
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
  await admin.from("audit_logs").delete().in("actor_id", created.users);
  console.log(`\nLimpeza: ${created.conversations.length} conversa(s) e ${created.users.length} usuário(s) de teste removidos.`);
}

try {
  await main();
} catch (error) {
  check("execução sem erros", false, error.message);
} finally {
  await cleanup();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} verificações passaram.`);
  process.exit(failed ? 1 : 0);
}
