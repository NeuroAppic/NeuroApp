import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { MfaSetup } from "@/features/dashboard/account/mfa-setup";
import { NewPasswordForm } from "@/features/account/new-password-form";
import { getStaffSession } from "@/lib/auth/dal";

export const metadata = { title: "Minha conta" };

export default async function StaffAccountPage() {
  const session = await getStaffSession();
  if (!session) redirect("/dashboard/entrar");
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Minha conta</h1>
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Dados</h2>
        <p className="mt-1">{session.fullName}</p>
        <p className="text-foreground-muted">{session.email}</p>
        <p className="mt-2 text-sm text-foreground-muted">
          Alterações de nome e registro profissional são feitas pela administração e exigem nova validação.
        </p>
      </Card>
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Verificação em duas etapas</h2>
        <MfaSetup currentLevel={session.aal} />
      </Card>
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Alterar senha</h2>
        <NewPasswordForm next="/dashboard/conta" />
      </Card>
    </div>
  );
}
