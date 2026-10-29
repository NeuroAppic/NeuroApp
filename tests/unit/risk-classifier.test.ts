import { describe, expect, it } from "vitest";
import { assessRisk, isElevatedRisk, maxRiskLevel, normalizeForRisk } from "@/lib/safety/risk-classifier";

describe("classificador de risco (apoio à triagem)", () => {
  it.each([
    ["Vou me matar hoje", "critical"],
    ["tomei todos os remédios", "critical"],
    ["estou me cortando agora", "critical"],
    ["Eu quero morrer", "high"],
    ["penso em tirar minha vida", "high"],
    ["Às vezes penso em suicídio", "high"],
    ["quero me machucar", "high"],
    ["não aguento mais", "attention"],
    ["não sei onde estou", "attention"],
    ["não consigo respirar", "attention"],
    ["Estou ansiosa com a prova", "none"],
    ["Estou em crise.", "none"],
  ] as const)("%s → %s", (text, level) => {
    expect(assessRisk(text).level).toBe(level);
  });

  it("ignora acentos, maiúsculas e pontuação", () => {
    expect(normalizeForRisk("NÃO   aguento... MAIS!")).toBe("nao aguento mais");
    expect(assessRisk("QUERO MORRER!!!").level).toBe("high");
  });

  it("respeita negação simples", () => {
    expect(assessRisk("eu não quero morrer, só estou cansada").level).toBe("none");
  });

  it("retorna apenas IDs de regras e versão, nunca o texto", () => {
    const result = assessRisk("quero morrer");
    expect(result.ruleIds).toEqual(["suicide.ideation"]);
    expect(result.version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    expect(JSON.stringify(result)).not.toContain("morrer");
  });

  it("compara níveis corretamente", () => {
    expect(maxRiskLevel("attention", "high")).toBe("high");
    expect(maxRiskLevel("critical", "none")).toBe("critical");
    expect(isElevatedRisk("high")).toBe(true);
    expect(isElevatedRisk("attention")).toBe(false);
  });
});
