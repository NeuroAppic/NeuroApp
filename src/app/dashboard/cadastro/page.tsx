import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { Card } from "@/components/ui/card";
import { StaffSignupForm } from "@/features/dashboard/staff-signup-form";

export const metadata: Metadata = { title: "Cadastro de profissional", robots: { index: false } };

export default function StaffSignupPage() {
  return (
    <main id="conteudo" className="flex min-h-dvh flex-col items-center gap-6 px-4 py-10">
      <Logo href="/" />
      <Card className="w-full max-w-lg p-6 sm:p-8">
        <h1 className="text-2xl font-bold">Cadastro de psicólogo(a)</h1>
        <p className="mt-1 text-foreground-muted">
          Depois do cadastro, a administração confere o seu registro profissional. Só então você poderá
          ver e assumir atendimentos.
        </p>
        <ol className="mt-4 list-inside list-decimal space-y-1 text-sm text-foreground-muted">
          <li>Preencha seus dados e o número do conselho (CRP).</li>
          <li>Confirme o e-mail pelo link que você vai receber.</li>
          <li>Entre no painel e aguarde a validação da sua credencial.</li>
        </ol>
        <StaffSignupForm />
        <p className="mt-6 text-center text-sm">
          Já tem cadastro?{" "}
          <Link href="/dashboard/entrar" className="font-semibold text-primary underline underline-offset-4">
            Entrar
          </Link>
        </p>
      </Card>
    </main>
  );
}
