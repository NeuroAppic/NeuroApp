import { redirect } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { Card } from "@/components/ui/card";
import { MfaChallenge } from "@/features/dashboard/account/mfa-challenge";
import { getStaffSession } from "@/lib/auth/dal";

// Sessão e permissões são verificadas a cada requisição: nunca pré-renderizar.
export const dynamic = "force-dynamic";

export const metadata = { title: "Verificação", robots: { index: false } };

/** Fora do layout do painel para não entrar em ciclo de redirecionamento. */
export default async function VerificacaoPage() {
  const session = await getStaffSession();
  if (!session) redirect("/dashboard/entrar");
  if (session.aal === "aal2") redirect("/dashboard");
  return (
    <main id="conteudo" className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <Logo href="/" />
      <Card className="w-full max-w-md p-6 sm:p-8">
        <h1 className="text-2xl font-bold">Verificação em duas etapas</h1>
        <MfaChallenge />
      </Card>
    </main>
  );
}
