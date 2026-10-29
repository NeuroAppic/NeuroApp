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

async function startChat(page: import("@playwright/test").Page) {
  await page.goto("/conversar");
  await page.getByRole("button", { name: "Entendi, quero começar" }).click();
  await expect(page.getByRole("heading", { name: "Assistente virtual (IA)" })).toBeVisible({ timeout: 20_000 });
}

test("pessoa inicia conversa, usa mensagem rápida e recebe resposta", async ({ page }) => {
  await page.goto("/conversar");
  await expect(page.getByRole("heading", { name: "Antes de começar" })).toBeVisible();
  await page.getByRole("button", { name: "Entendi, quero começar" }).click();
  await expect(page.getByRole("heading", { name: "Assistente virtual (IA)" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Estou em crise" }).click();
  await expect(page.getByText("Estou em crise.").first()).toBeVisible();
  await expect(page.getByRole("log", { name: "Histórico da conversa" }).getByText(/Podemos ir com calma/)).toBeVisible({ timeout: 15_000 });

  // Persistência: ao recarregar, a conversa continua.
  await page.reload();
  await expect(page.getByRole("log", { name: "Histórico da conversa" }).getByText(/Podemos ir com calma/)).toBeVisible({ timeout: 20_000 });
});

test("situação de risco mostra recursos de apoio", async ({ page }) => {
  await startChat(page);
  await page.getByLabel("Sua mensagem").fill("eu quero morrer");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.locator('a[href="tel:188"]').first()).toBeVisible({ timeout: 15_000 });
});

test("pedido de atendimento humano é honesto sobre disponibilidade", async ({ page }) => {
  await startChat(page);
  await page.getByRole("button", { name: "Quero falar com uma pessoa" }).last().click();
  await expect(page.getByText(/Seu pedido (está na fila|para falar com uma pessoa foi registrado)|não há profissionais disponíveis/).first()).toBeVisible();
});
