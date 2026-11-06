import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffSignupForm } from "@/features/dashboard/staff-signup-form";
import { safeNext } from "@/lib/safe-redirect";

const signUp = vi.fn();
const signOut = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  getBrowserSupabase: () => ({ auth: { signUp, signOut } }),
}));

async function fill(overrides: Partial<Record<string, string>> = {}) {
  const values = {
    "Nome completo": "Ana Souza",
    "Como as pessoas atendidas vão ver seu nome": "Ana",
    "Registro (CRP)": "CRP 06/123456",
    "E-mail": "ana@exemplo.org",
    Senha: "senha-segura-123",
    "Repita a senha": "senha-segura-123",
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    const field = screen.getByLabelText(label);
    await userEvent.clear(field);
    if (value) await userEvent.type(field, value);
  }
}

describe("cadastro de psicólogo(a)", () => {
  beforeEach(() => {
    signUp.mockReset();
    signOut.mockReset();
  });

  it("exige CRP e a declaração", async () => {
    render(<StaffSignupForm />);
    await fill({ "Registro (CRP)": "" });
    await userEvent.click(screen.getByRole("button", { name: "Criar cadastro" }));
    expect(await screen.findByText(/Informe o registro profissional/)).toBeInTheDocument();
    expect(screen.getByText("Confirme a declaração para continuar.")).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("exige senhas iguais", async () => {
    render(<StaffSignupForm />);
    await fill({ "Repita a senha": "outra-senha-999" });
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Criar cadastro" }));
    expect(await screen.findByText("As senhas não são iguais.")).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("envia os dados profissionais e pede confirmação do e-mail", async () => {
    signUp.mockResolvedValue({ data: { session: null, user: { id: "u1" } }, error: null });
    render(<StaffSignupForm />);
    await fill();
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Criar cadastro" }));

    expect(await screen.findByText(/Confirme seu e-mail/)).toBeInTheDocument();
    const args = signUp.mock.calls[0]![0];
    expect(args).toMatchObject({
      email: "ana@exemplo.org",
      password: "senha-segura-123",
      options: {
        data: {
          staff_signup: {
            full_name: "Ana Souza",
            display_name: "Ana",
            professional_registry: "CRP 06/123456",
          },
        },
      },
    });
    expect(args.options.emailRedirectTo).toMatch(/\/auth\/confirm\?next=\/dashboard$/);
    // Nada além do perfil profissional é enviado (nenhum papel administrativo).
    expect(Object.keys(args.options.data.staff_signup).sort()).toEqual(
      ["display_name", "full_name", "professional_registry", "professional_title"],
    );
  });

  it("e-mail já cadastrado mostra orientação", async () => {
    signUp.mockResolvedValue({ data: { session: null, user: null }, error: { message: "User already registered" } });
    render(<StaffSignupForm />);
    await fill();
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Criar cadastro" }));
    expect(await screen.findByText(/já tem cadastro/)).toBeInTheDocument();
  });
});

describe("destinos de redirecionamento", () => {
  it("aceita só rotas internas conhecidas", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard");
    expect(safeNext("/redefinir-senha?next=%2Fdashboard")).toBe("/redefinir-senha?next=%2Fdashboard");
    expect(safeNext("https://malicioso.example")).toBe("/");
    expect(safeNext("//malicioso.example/dashboard")).toBe("/");
    expect(safeNext("/\\malicioso.example")).toBe("/");
    expect(safeNext("/qualquer-coisa")).toBe("/");
  });
});
