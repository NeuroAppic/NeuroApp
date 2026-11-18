import { redirect } from "next/navigation";
import { ConversationCenter } from "@/features/dashboard/conversations/conversation-center";
import { getStaffSession } from "@/lib/auth/dal";

export const metadata = { title: "Atendimentos" };

export default async function AtendimentosPage() {
  const session = await getStaffSession();
  if (!session) redirect("/dashboard/entrar");
  if (!session.isClinician && !session.isAdmin) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold">Atendimentos</h1>
        <p className="mt-2 text-foreground-muted">
          Sua conta não tem o papel de psicólogo(a). Peça à administração para ajustar os papéis em Equipe.
        </p>
      </div>
    );
  }
  return <ConversationCenter staffId={session.userId} isClinician={session.isClinician} isAdmin={session.isAdmin} />;
}
