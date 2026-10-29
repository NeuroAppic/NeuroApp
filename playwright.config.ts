import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
    reducedMotion: "reduce",
    locale: "pt-BR",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // Os testes E2E usam o provedor de IA simulado (AI_PROVIDER=mock): nunca chamam API paga.
    command: `npm run start -- -p ${port}`,
    port,
    reuseExistingServer: !process.env.CI,
    env: { AI_PROVIDER: "mock" },
  },
});
