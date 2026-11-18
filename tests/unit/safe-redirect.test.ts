import { describe, expect, it } from "vitest";
import { passwordSetupPath, safeNext } from "@/lib/safe-redirect";

describe("destinos de redirecionamento", () => {
  it("aceita só rotas internas conhecidas", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard");
    expect(safeNext("/redefinir-senha?next=%2Fdashboard")).toBe("/redefinir-senha?next=%2Fdashboard");
    expect(safeNext("https://malicioso.example")).toBe("/");
    expect(safeNext("//malicioso.example/dashboard")).toBe("/");
    expect(safeNext("/\malicioso.example")).toBe("/");
    expect(safeNext("/qualquer-coisa")).toBe("/");
  });

  it("monta o caminho para definir a senha", () => {
    expect(passwordSetupPath("/dashboard")).toBe("/redefinir-senha?next=%2Fdashboard");
  });
});
