import { describe, expect, it } from "vitest";
import { breathingPhase, RHYTHMS } from "@/features/games/breathing";
import { shuffle, swap } from "@/features/games/color-sort";
import { applyTool, validateGarden, type Plot } from "@/features/games/garden";
import { fillBrown, fillPink, generateNoise } from "@/features/sounds/noise";
import { parsePreferences, resolveTheme } from "@/lib/preferences/preferences";
import { cleanText, postMessageSchema, staffInviteSchema, validateAudioFile } from "@/lib/validation/schemas";

describe("validação de entradas", () => {
  it("remove caracteres de controle e limita o tamanho da mensagem", () => {
    expect(cleanText("  oi\u0000\u0007 \n tudo bem ")).toBe("oi \n tudo bem");
    const ok = postMessageSchema.safeParse({ content: " Oi ", clientMessageId: crypto.randomUUID() });
    expect(ok.success && ok.data.content).toBe("Oi");
    expect(postMessageSchema.safeParse({ content: "   ", clientMessageId: crypto.randomUUID() }).success).toBe(false);
    expect(postMessageSchema.safeParse({ content: "x".repeat(2001), clientMessageId: crypto.randomUUID() }).success).toBe(false);
    expect(postMessageSchema.safeParse({ content: "Oi", clientMessageId: "nao-e-uuid" }).success).toBe(false);
  });

  it("exige registro profissional para psicólogos", () => {
    const base = { email: "a@b.com", fullName: "Ana Souza", displayName: "Ana", roles: ["psychologist"] as const };
    expect(staffInviteSchema.safeParse({ ...base, roles: [...base.roles] }).success).toBe(false);
    expect(staffInviteSchema.safeParse({ ...base, roles: [...base.roles], professionalRegistry: "CRP 06/1234" }).success).toBe(true);
  });

  it("valida tipo e tamanho de áudio", () => {
    expect(validateAudioFile({ type: "audio/mpeg", size: 1000 })).toBeNull();
    expect(validateAudioFile({ type: "application/x-msdownload", size: 1000 })).toMatch(/Formato/);
    expect(validateAudioFile({ type: "audio/mpeg", size: 60 * 1024 * 1024 })).toMatch(/50 MB/);
  });
});

describe("preferências", () => {
  it("ignora valores inválidos e resolve o tema do sistema", () => {
    const p = parsePreferences({ theme: "neon", textScale: 9, lowStimulus: true });
    expect(p.theme).toBe("system");
    expect(p.textScale).toBe(1);
    expect(p.lowStimulus).toBe(true);
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });
});

describe("jogos", () => {
  it("jardim: plantar e regar até florescer, sem punição", () => {
    let plot: Plot = { flower: null, growth: 0 };
    plot = applyTool(plot, "water", "lavanda");
    expect(plot).toEqual({ flower: null, growth: 0 });
    plot = applyTool(plot, "plant", "lavanda");
    for (let i = 0; i < 10; i++) plot = applyTool(plot, "water", "lavanda");
    expect(plot).toEqual({ flower: "lavanda", growth: 3 });
    expect(validateGarden([{ flower: "x", growth: 1 }])).toBeNull();
  });

  it("organizar cores: troca e embaralha sem perder peças", () => {
    expect(swap(["a", "b", "c"], 0, 2)).toEqual(["c", "b", "a"]);
    const items = Array.from({ length: 16 }, (_, i) => i);
    expect([...shuffle(items)].sort((a, b) => a - b)).toEqual(items);
  });

  it("respiração: só inspirar e expirar, sem retenção", () => {
    for (const r of RHYTHMS) expect(Object.keys(r)).not.toContain("hold");
    expect(breathingPhase(1, 4, 4).phase).toBe("inhale");
    expect(breathingPhase(5, 4, 4)).toEqual({ phase: "exhale", progress: 0.25 });
    expect(breathingPhase(8, 4, 4).phase).toBe("inhale");
  });

  it("geradores de som produzem sinal limitado e sem estalo no laço", () => {
    for (const kind of ["white", "pink", "brown", "rain", "fan", "water", "wind"] as const) {
      const out = generateNoise(kind, 48_000, 48_000);
      expect(Math.max(...out.map(Math.abs))).toBeLessThan(1.5);
    }
    const pink = new Float32Array(10_000);
    fillPink(pink);
    const brown = new Float32Array(10_000);
    fillBrown(brown);
    expect(pink.some((v) => v !== 0)).toBe(true);
    expect(brown.some((v) => v !== 0)).toBe(true);
  });
});
