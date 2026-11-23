import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";

/**
 * Atendimento humano de ponta a ponta, com dois navegadores ao mesmo tempo:
 * visitante no portal e psicóloga no painel. Usa uma conta descartável criada
 * pela chave secreta e apagada no final. Ative com E2E_SUPABASE=1.
 */
test.skip(process.env.E2E_SUPABASE !== "1", "Requer Supabase (E2E_SUPABASE=1).");
test.use({ actionTimeout: 20_000 });
test.describe.configure({ timeout: 90_000 });

try {
  process.loadEnvFile(".env.local");
} catch {
  // variáveis podem vir do ambiente
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const secret = process.env.SUPABASE_SECRET_KEY ?? "";

/** Abre a sessão pela API e coloca os cookies no navegador da psicóloga. */
async function signInContext(context: BrowserContext, email: string, password: string) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(url, publishable, {
    cookies: {
      getAll: () => jar,
      setAll: (cookies) => {
        for (const c of cookies) {
          const i = jar.findIndex((x) => x.name === c.name);
          if (i >= 0) jar.splice(i, 1);
          if (c.value) jar.push({ name: c.name, value: c.value });
        }
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await context.addCookies(jar.map((c) => ({ ...c, domain: "localhost", path: "/", sameSite: "Lax" as const })));
}

test.describe("atendimento humano", () => {
  let admin: SupabaseClient;
  let staffId = "";
  let email = "";
  let password = "";
  const visitorIds: string[] = [];

  test.beforeEach(async () => {
    admin = createClient(url, secret, { auth: { persistSession: false } });
    email = `acolher-teste-e2e-${crypto.randomUUID().slice(0, 8)}@example.com`;
    password = `T${crypto.randomUUID()}!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error;
    staffId = data.user.id;
    await admin.from("staff_profiles").insert({
      user_id: staffId,
      full_name: "Teste E2E",
      display_name: "Teste E2E",
    });
    await admin.from("staff_roles").insert({ user_id: staffId, role: "psychologist" });
  });

  test.afterEach(async () => {
    for (const id of visitorIds.splice(0)) {
      await admin.from("conversations").delete().eq("user_id", id);
      await admin.from("ai_usage").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
    await admin.from("audit_logs").delete().eq("actor_id", staffId);
    await admin.auth.admin.deleteUser(staffId);
  });

  test("psicóloga assume, conversa em tempo real e finaliza", async ({ browser }) => {
    const visitorContext = await browser.newContext();
    const staffContext = await browser.newContext();
    const visitor = await visitorContext.newPage();
    const staff = await staffContext.newPage();
    await signInContext(staffContext, email, password);

    // Psicóloga abre a central e fica disponível.
    await staff.goto("/dashboard/atendimentos");
    await expect(staff.getByRole("heading", { name: "Atendimentos" })).toBeVisible();
    await expect(staff.getByText("Atualização em tempo real ativa")).toBeVisible({ timeout: 20_000 });
    await staff.getByRole("button", { name: "Ficar disponível" }).click();
    await expect(staff.getByRole("button", { name: "Ficar disponível" })).toBeHidden();

    // Visitante pede para falar com uma pessoa.
    await visitor.goto("/");
    await expect(visitor.getByRole("heading", { name: /Assistente virtual/ })).toBeVisible({ timeout: 20_000 });
    await expect(visitor.getByLabel("Sua mensagem")).toBeEnabled({ timeout: 20_000 });
    const started = visitor.waitForResponse((r) => r.url().endsWith("/api/conversations") && r.request().method() === "POST");
    // Um toque: a conversa começa junto com o pedido.
    await visitor.getByRole("button", { name: "Falar com uma pessoa" }).click();
    const { conversationId } = (await (await started).json()) as { conversationId: string };
    const { data: own } = await admin.from("conversations").select("user_id").eq("id", conversationId).single();
    visitorIds.push(own?.user_id as string);
    await expect(visitor.getByText(/Seu pedido está na fila/)).toBeVisible({ timeout: 15_000 });

    // A fila atualiza sozinha, sem recarregar a página.
    // Sempre a conversa criada por este teste: a fila pode ter conversas de pessoas reais.
    const queueItem = staff.locator(`[data-conversation-id="${conversationId}"]`);
    await expect(queueItem).toBeVisible({ timeout: 15_000 });
    await expect(staff).toHaveTitle(/^\(\d+\) Atendimentos/);
    await queueItem.click();
    await staff.getByRole("button", { name: "Assumir atendimento" }).click();

    // A pessoa é avisada de que agora fala com uma pessoa.
    await expect(visitor.getByText(/Você está conversando com uma pessoa/)).toBeVisible({ timeout: 15_000 });
    await expect(visitor.getByRole("log").getByText(/Um profissional assumiu esta conversa/)).toBeVisible();

    // Mensagens nos dois sentidos, em tempo real.
    await staff.getByLabel("Resposta").fill("Olá, estou aqui com você.");
    await staff.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(visitor.getByRole("log").getByText("Olá, estou aqui com você.")).toBeVisible({ timeout: 15_000 });

    await visitor.getByLabel("Sua mensagem").fill("Obrigado por vir.");
    await visitor.getByRole("button", { name: "Enviar mensagem" }).click();
    await expect(staff.getByRole("list", { name: "Mensagens" }).getByText("Obrigado por vir.")).toBeVisible({ timeout: 15_000 });

    // A IA não responde durante o atendimento humano.
    await visitor.waitForTimeout(2500);
    await expect(visitor.getByText("O assistente está escrevendo…")).toBeHidden();
    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("sender", "ai")
      .eq("content", "Obrigado por vir.");
    expect(count).toBe(0);

    // Finalizar encerra para os dois lados.
    await staff.getByRole("button", { name: "Finalizar" }).click();
    await expect(visitor.getByText("Esta conversa foi encerrada.")).toBeVisible({ timeout: 15_000 });

    await visitorContext.close();
    await staffContext.close();
  });

  test("psicóloga vê o painel e a sua conta", async ({ browser }) => {
    const context = await browser.newContext();
    await signInContext(context, email, password);
    const page = await context.newPage();

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard\/atendimentos$/);
    await page.goto("/dashboard/conta");
    await expect(page.getByRole("heading", { name: "Minha conta" })).toBeVisible();
    // Sem papel administrativo, as páginas de gestão devolvem para o início.
    await page.goto("/dashboard/equipe");
    await expect(page).toHaveURL(/\/dashboard\/atendimentos$/);
    await context.close();
  });

  test("administrador cadastra psicólogo só com e-mail e senha, e ele já atende", async ({ browser }) => {
    // Conta de administrador descartável (a conta de psicóloga do beforeEach vira administradora).
    await admin.from("staff_roles").delete().eq("user_id", staffId);
    await admin.from("staff_roles").insert({ user_id: staffId, role: "admin" });

    const adminContext = await browser.newContext();
    await signInContext(adminContext, email, password);
    const adminPage = await adminContext.newPage();
    // A visão geral (só administradores) abre sem erro de servidor.
    await adminPage.goto("/dashboard");
    await expect(adminPage.getByRole("heading", { name: "Visão geral" })).toBeVisible();
    await expect(adminPage.getByText("Pessoas ativas")).toBeVisible();
    await adminPage.goto("/dashboard/equipe");

    const newEmail = `acolher-teste-novo-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const newPassword = `T${crypto.randomUUID().slice(0, 12)}`;
    await adminPage.getByRole("button", { name: "Cadastrar psicólogo(a)" }).click();
    const dialog = adminPage.getByRole("dialog");
    await expect(dialog.getByText(/Registro|CRP/)).toHaveCount(0);
    await dialog.getByLabel("E-mail").fill(newEmail);
    await dialog.getByLabel("Senha").fill(newPassword);
    await dialog.getByRole("button", { name: "Criar conta" }).click();
    await expect(adminPage.getByText(/Conta criada\./)).toBeVisible({ timeout: 15_000 });

    const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
    const created = list.users.find((u) => u.email === newEmail);
    expect(created?.email_confirmed_at).toBeTruthy();
    try {
      // A conta nova entra direto e já tem a central de atendimentos.
      const psiContext = await browser.newContext();
      await signInContext(psiContext, newEmail, newPassword);
      const psiPage = await psiContext.newPage();
      await psiPage.goto("/dashboard");
      await expect(psiPage).toHaveURL(/\/dashboard\/atendimentos$/);
      await expect(psiPage.getByRole("heading", { name: "Atendimentos" })).toBeVisible();
      await expect(psiPage.getByRole("button", { name: "Ficar disponível" })).toBeVisible();
      await psiContext.close();
    } finally {
      if (created) {
        await admin.from("audit_logs").delete().eq("target_id", created.id);
        await admin.auth.admin.deleteUser(created.id);
      }
      await adminContext.close();
    }
  });
});
