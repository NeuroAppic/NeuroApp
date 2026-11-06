import { expect, test } from "@playwright/test";

test.describe("página inicial", () => {
  test("acolhe e leva ao chat com um clique", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Você não precisa enfrentar este momento sozinho.");
    await expect(page.getByRole("link", { name: "Preciso de ajuda agora" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Quero ouvir sons relaxantes" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Quero me distrair um pouco" })).toBeVisible();
    await page.getByRole("link", { name: "Quero conversar" }).click();
    await expect(page).toHaveURL(/\/conversar$/);
  });

  test("não há rolagem horizontal nem som automático", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(await page.locator("audio[autoplay], video[autoplay]").count()).toBe(0);
  });

  test("ajuda agora mostra CVV e SAMU com links de ligação", async ({ page }) => {
    await page.goto("/ajuda");
    await expect(page.locator('a[href="tel:188"]')).toBeVisible();
    await expect(page.locator('a[href="tel:192"]')).toBeVisible();
  });
});

test.describe("configurações sensoriais", () => {
  test("modo de baixo estímulo e tamanho do texto persistem após recarregar", async ({ page }) => {
    await page.goto("/configuracoes");
    await page.getByRole("switch", { name: "Modo de baixo estímulo" }).click();
    await page.getByText("Muito grande").click();
    await expect(page.locator("html")).toHaveAttribute("data-low-stimulus", "");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-low-stimulus", "");
    const scale = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--text-scale"));
    expect(scale.trim()).toBe("1.5");
  });

  test("tema escuro pode ser escolhido", async ({ page }) => {
    await page.goto("/configuracoes");
    await page.getByText("Escuro", { exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});

test.describe("sons", () => {
  test("player toca, pausa e para — nada começa sozinho", async ({ page }) => {
    await page.goto("/sons");
    await expect(page.getByText("Nada toca sem você apertar o play.")).toBeVisible();
    await page.getByRole("button", { name: /Tocar Ruído marrom/ }).click();
    await expect(page.getByText("Tocando", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Pausar", exact: true }).click();
    await expect(page.getByText("Pausado", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Parar agora" }).click();
    await expect(page.getByText("Pausado", { exact: true })).toBeVisible();
  });
});

test.describe("jogos", () => {
  for (const slug of ["jardim", "cores", "bolhas", "desenho", "respiracao"]) {
    test(`${slug} abre, funciona e tem botão de sair`, async ({ page }) => {
      await page.goto(`/jogos/${slug}`);
      await expect(page.getByRole("link", { name: "Sair" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("jardim: plantar e regar", async ({ page }) => {
    await page.goto("/jogos/jardim");
    await page.getByRole("button", { name: "Canteiro 1: vazio" }).click();
    await page.getByRole("radio", { name: "Regar" }).click();
    await page.getByRole("button", { name: "Canteiro 1: Lavanda, semente" }).click();
    await expect(page.getByRole("button", { name: "Canteiro 1: Lavanda, broto" })).toBeVisible();
  });

  test("desenho: traçar, desfazer", async ({ page }) => {
    await page.goto("/jogos/desenho");
    const canvas = page.getByRole("img", { name: /Quadro de desenho/ });
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + 120, { steps: 8 });
    await page.mouse.up();
    const undo = page.getByRole("button", { name: "Desfazer" });
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(undo).toBeDisabled();
  });

  test("respiração começa só com toque e para na hora", async ({ page }) => {
    await page.goto("/jogos/respiracao");
    await expect(page.getByText("Pronto quando você quiser")).toBeVisible();
    await page.getByRole("button", { name: "Começar" }).click();
    await expect(page.getByRole("button", { name: "Parar" })).toBeVisible();
    await page.getByRole("button", { name: "Parar" }).click();
    await expect(page.getByText("Pronto quando você quiser")).toBeVisible();
  });
});

test("painel exige login", async ({ page }) => {
  await page.goto("/dashboard/atendimentos");
  await expect(page).toHaveURL(/\/dashboard\/entrar/);
});

test.describe("entrada de profissionais", () => {
  test("cadastro de psicólogo abre sem login e valida o CRP", async ({ page }) => {
    await page.goto("/dashboard/entrar");
    await page.getByRole("link", { name: "Cadastre-se" }).click();
    await expect(page).toHaveURL(/\/dashboard\/cadastro$/);
    await expect(page.getByRole("heading", { name: "Cadastro de psicólogo(a)" })).toBeVisible();
    await page.getByRole("button", { name: "Criar cadastro" }).click();
    await expect(page.getByText(/Informe o registro profissional/)).toBeVisible();
  });

  test("link de convite inválido explica o que fazer", async ({ page }) => {
    await page.goto("/auth/callback?next=/dashboard");
    await expect(page.getByRole("heading", { name: "Este link não funcionou" })).toBeVisible();
  });
});
