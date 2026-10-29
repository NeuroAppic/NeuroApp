import type { Metadata } from "next";
import { Logo } from "@/components/layout/logo";
import { Card } from "@/components/ui/card";
import { StaffLoginForm } from "@/features/dashboard/staff-login-form";

export const metadata: Metadata = { title: "Entrar — equipe", robots: { index: false } };

export default async function StaffLoginPage({ searchParams }: PageProps<"/dashboard/entrar">) {
  const { motivo } = await searchParams;
  return (
    <main id="conteudo" className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <Logo href="/" />
      <Card className="w-full max-w-md p-6 sm:p-8">
        <h1 className="text-2xl font-bold">Área da equipe</h1>
        <p className="mt-1 text-foreground-muted">Acesso restrito a profissionais e administradores autorizados.</p>
        {motivo === "sem-acesso" && (
          <p role="alert" className="mt-4 rounded-xl bg-danger-soft p-3 text-sm font-medium text-danger">
            Esta conta não tem acesso ao painel ou está desativada.
          </p>
        )}
        <StaffLoginForm />
      </Card>
    </main>
  );
}
