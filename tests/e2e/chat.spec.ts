import { expect, test } from "@playwright/test";

/**
 * Fluxo completo do chat. Requer um projeto Supabase (local ou na nuvem)
 * com as migrações aplicadas, login anônimo ativado e as variáveis em .env.local. A IA usa o
 * provedor simulado (AI_PROVIDER=mock). Ative com E2E_SUPABASE=1.
 */
test.skip(process.env.E2E_SUPABASE !== "1", "Requer Supabase (E2E_SUPABASE=1).");

// O projeto pode estar em outra região: chamadas de rede levam mais tempo que no localhost.
test.use({ actionTimeout: 20_000 });
test.describe.configure({ timeout: 60_000 });

/** A conversa abre direto na tela inicial, pronta para escrever. */
async function openChat(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Assistente virtual/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Sua mensagem")).toBeEnabled({ timeout: 20_000 });
}

test("pessoa abre o app e conversa na hora, sem etapa prévia", async ({ page }) => {
  await openChat(page);
  await expect(page.getByRole("heading", { name: "Antes de começar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Entendi/ })).toHaveCount(0);
  // Transparência continua visível junto ao campo de mensagem.
  await expect(page.getByText(/Você conversa com uma IA, não com uma pessoa/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Política de privacidade" })).toBeVisible();

  await page.getByRole("button", { name: "Estou ansioso(a)" }).click();
  const log = page.getByRole("log", { name: "Histórico da conversa" });
  await expect(log.getByText("Estou ansioso(a) e queria conversar.")).toBeVisible();
  await expect(log.getByText(/Obrigado por me contar/)).toBeVisible({ timeout: 20_000 });
  // As sugestões somem depois da primeira mensagem.
  await expect(page.getByRole("list", { name: "Sugestões para começar" })).toHaveCount(0);

  // Persistência: ao recarregar, a conversa continua.
  await page.reload();
  await expect(log.getByText(/Obrigado por me contar/)).toBeVisible({ timeout: 20_000 });
});

test("o endereço antigo /conversar leva à conversa", async ({ page }) => {
  await page.goto("/conversar");
  await expect(page).toHaveURL(/localhost:\d+\/$/);
});

test("situação de risco mostra recursos de apoio", async ({ page }) => {
  await openChat(page);
  await page.getByLabel("Sua mensagem").fill("eu quero morrer");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  // O painel de segurança (não o aviso fixo junto ao campo) traz os contatos.
  const safety = page.getByRole("region", { name: /não precisa passar por isso sozinho/i });
  await expect(safety.locator('a[href="tel:188"]')).toBeVisible({ timeout: 20_000 });
  await expect(safety.locator('a[href="tel:192"]')).toBeVisible();
});

test("pedido de atendimento humano é honesto sobre disponibilidade", async ({ page }) => {
  await openChat(page);
  // Funciona mesmo antes da primeira mensagem: a conversa começa junto com o pedido.
  await page.getByRole("button", { name: "Falar com uma pessoa" }).click();
  await expect(page.getByText(/Seu pedido (está na fila|para falar com uma pessoa foi registrado)|não há profissionais disponíveis/).first()).toBeVisible({ timeout: 20_000 });
});
