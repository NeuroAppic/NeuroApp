import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/features/dashboard/dashboard-shell";
import { getStaffSession, staffMfaRequired } from "@/lib/auth/dal";

// Sessão e permissões são verificadas a cada requisição: nunca pré-renderizar.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Painel", template: "%s · Painel Acolher" },
  robots: { index: false, follow: false },
};

/**
 * Toda rota do painel passa por aqui: exige sessão de equipe ativa.
 * Cada página e cada função do banco verificam de novo o papel específico.
 */
export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const session = await getStaffSession();
  if (!session) redirect("/dashboard/entrar?motivo=sem-acesso");
  if (staffMfaRequired() && session.aal !== "aal2") redirect("/dashboard/verificacao");

  return (
    <DashboardShell
      session={{
        displayName: session.displayName,
        roles: session.roles,
        isAdmin: session.isAdmin,
        isSuperadmin: session.isSuperadmin,
        isClinician: session.isClinician,
        credentialStatus: session.credentialStatus,
      }}
    >
      {children}
    </DashboardShell>
  );
}
