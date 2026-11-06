import type { Metadata } from "next";
import Link from "next/link";
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
        {motivo === "link" && (
          <p role="alert" className="mt-4 rounded-xl bg-danger-soft p-3 text-sm font-medium text-danger">
            O link expirou ou já foi usado. Entre com sua senha ou peça um novo link.
          </p>
        )}
        {motivo === "sem-acesso" && (
          <p role="alert" className="mt-4 rounded-xl bg-danger-soft p-3 text-sm font-medium text-danger">
            Esta conta não tem acesso ao painel ou está desativada.
          </p>
        )}
        <StaffLoginForm />
        <p className="mt-6 border-t border-border pt-4 text-center text-sm">
          É psicólogo(a) e ainda não tem cadastro?{" "}
          <Link href="/dashboard/cadastro" className="font-semibold text-primary underline underline-offset-4">
            Cadastre-se
          </Link>
        </p>
      </Card>
    </main>
  );
}
