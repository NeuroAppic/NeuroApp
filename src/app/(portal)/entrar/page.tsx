import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { UserLoginForm } from "@/features/account/user-login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function EntrarPage({ searchParams }: PageProps<"/entrar">) {
  const { erro } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-bold">Entrar</h1>
        <p className="mt-1 text-foreground-muted">Para quem já criou uma conta. Não é preciso conta para conversar.</p>
        {erro === "link" && (
          <p role="alert" className="mt-4 rounded-xl bg-danger-soft p-3 text-sm font-medium text-danger">
            O link expirou ou já foi usado. Peça um novo.
          </p>
        )}
        <UserLoginForm />
      </Card>
    </div>
  );
}
