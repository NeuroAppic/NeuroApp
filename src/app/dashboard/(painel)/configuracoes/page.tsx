import { redirect } from "next/navigation";
import { DeletionRequests } from "@/features/dashboard/settings/deletion-requests";
import { SettingsEditor } from "@/features/dashboard/settings/settings-editor";
import { getStaffSession } from "@/lib/auth/dal";
import { getServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Configurações" };

export default async function DashboardSettingsPage() {
  const session = await getStaffSession();
  if (!session?.isAdmin) redirect("/dashboard");

  const supabase = await getServerSupabase();
  const [{ data: settings }, { data: requests }] = await Promise.all([
    supabase.from("app_settings").select("key, value, description, updated_at"),
    supabase
      .from("deletion_requests")
      .select("id, scope, conversation_id, pending_reason, requested_at")
      .eq("status", "pending")
      .order("requested_at"),
  ]);
  const map = Object.fromEntries((settings ?? []).map((s) => [s.key as string, s.value as unknown]));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold">Configurações da plataforma</h1>
        <p className="text-foreground-muted">
          {session.isSuperadmin
            ? "Alterações valem imediatamente e ficam registradas na auditoria."
            : "Somente superadministradores podem alterar estas configurações."}
        </p>
      </header>
      <SettingsEditor initial={map} canEdit={session.isSuperadmin} />
      <DeletionRequests requests={(requests ?? []) as Parameters<typeof DeletionRequests>[0]["requests"]} />
    </div>
  );
}
