import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { NewPasswordForm } from "@/features/account/new-password-form";
import { safeNext } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Definir senha", robots: { index: false } };

export default async function RedefinirSenhaPage({ searchParams }: PageProps<"/redefinir-senha">) {
  const { next } = await searchParams;
  const destination = safeNext(typeof next === "string" ? next : null);
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-bold">Definir senha</h1>
        <p className="mt-1 text-foreground-muted">Escolha uma senha com pelo menos 10 caracteres.</p>
        <NewPasswordForm next={destination} />
      </Card>
    </div>
  );
}
