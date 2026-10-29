import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { getStaffSession } from "@/lib/auth/dal";
import { getServerSupabase } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Auditoria" };

const ACTION_LABEL: Record<string, string> = {
  "conversation.view": "Leu uma conversa",
  "conversation.claim": "Assumiu atendimento",
  "conversation.close": "Finalizou atendimento",
  "conversation.release_to_ai": "Devolveu para a IA",
  "conversation.transfer": "Transferiu atendimento",
  "conversation.legal_hold.set": "Ativou bloqueio legal",
  "conversation.legal_hold.clear": "Removeu bloqueio legal",
  "staff.register": "Cadastrou profissional",
  "staff.update_profile": "Alterou perfil profissional",
  "staff.credential_status": "Alterou status de credencial",
  "staff.activate": "Reativou acesso",
  "staff.deactivate": "Revogou acesso",
  "staff.set_roles": "Alterou papéis",
  "staff.bootstrap_superadmin": "Criou primeiro superadministrador",
  "settings.update": "Alterou configuração",
  "privacy.export": "Pessoa exportou seus dados",
  "privacy.delete_conversation": "Pessoa apagou conversa",
  "privacy.delete_conversation.pending": "Pedido de exclusão com retenção",
  "privacy.delete_account": "Pessoa encerrou a conta",
  "privacy.resolve_deletion": "Resolveu pedido de exclusão",
  "retention.purge": "Rotina de retenção executada",
};

export default async function AuditoriaPage({ searchParams }: PageProps<"/dashboard/auditoria">) {
  const session = await getStaffSession();
  if (!session?.isSuperadmin) redirect("/dashboard");
  const { pagina } = await searchParams;
  const page = Math.max(0, Number(pagina ?? 0) || 0);
  const pageSize = 50;

  const supabase = await getServerSupabase();
  const [{ data: logs }, { data: staff }] = await Promise.all([
    supabase
      .from("audit_logs")
      .select("id, actor_id, actor_kind, action, target_type, target_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1),
    supabase.from("staff_profiles").select("user_id, display_name"),
  ]);
  const names = new Map((staff ?? []).map((s) => [s.user_id as string, s.display_name as string]));

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Auditoria</h1>
        <p className="text-foreground-muted">Operações sensíveis e acessos a conversas. Os registros não contêm conteúdo das mensagens.</p>
      </header>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="text-left text-foreground-muted">
            <tr>
              <th scope="col" className="p-3 font-semibold">Quando</th>
              <th scope="col" className="p-3 font-semibold">Quem</th>
              <th scope="col" className="p-3 font-semibold">Ação</th>
              <th scope="col" className="p-3 font-semibold">Alvo</th>
            </tr>
          </thead>
          <tbody>
            {(logs ?? []).map((log) => (
              <tr key={log.id as number} className="border-t border-border">
                <td className="p-3 whitespace-nowrap">{formatDateTime(log.created_at as string)}</td>
                <td className="p-3">
                  {log.actor_kind === "system" ? "Sistema" : log.actor_kind === "user" ? "Pessoa usuária" : (names.get(log.actor_id as string) ?? "Equipe")}
                </td>
                <td className="p-3">{ACTION_LABEL[log.action as string] ?? (log.action as string)}</td>
                <td className="p-3 font-mono text-xs text-foreground-muted">
                  {log.target_type as string} {log.target_id ? `${String(log.target_id).slice(0, 8)}…` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <nav aria-label="Paginação" className="flex gap-3">
        {page > 0 && <a className="font-semibold underline" href={`?pagina=${page - 1}`}>Mais recentes</a>}
        {(logs?.length ?? 0) === pageSize && <a className="font-semibold underline" href={`?pagina=${page + 1}`}>Mais antigos</a>}
      </nav>
    </div>
  );
}
