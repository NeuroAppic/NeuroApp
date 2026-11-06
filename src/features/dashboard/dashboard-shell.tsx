"use client";

import {
  BarChart3,
  FileClock,
  Headphones,
  LogOut,
  MessagesSquare,
  Settings,
  UserCog,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "@/components/layout/logo";
import { Badge } from "@/components/ui/badge";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { CredentialStatus, StaffRole } from "@/types/domain";
import { AvailabilityControl } from "./availability-control";

export interface ShellSession {
  displayName: string;
  roles: StaffRole[];
  isAdmin: boolean;
  isSuperadmin: boolean;
  isClinician: boolean;
  credentialStatus: CredentialStatus;
}

const ROLE_LABEL: Record<StaffRole, string> = {
  superadmin: "Superadministrador",
  admin: "Administrador",
  psychologist: "Psicólogo(a)",
};

export function DashboardShell({ session, children }: { session: ShellSession; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const nav = [
    { href: "/dashboard", label: "Visão geral", icon: BarChart3, show: session.isAdmin },
    { href: "/dashboard/atendimentos", label: "Atendimentos", icon: MessagesSquare, show: session.roles.includes("psychologist") || session.isAdmin },
    { href: "/dashboard/equipe", label: "Equipe", icon: Users, show: session.isAdmin },
    { href: "/dashboard/audios", label: "Áudios", icon: Headphones, show: session.isAdmin },
    { href: "/dashboard/configuracoes", label: "Configurações", icon: Settings, show: session.isAdmin },
    { href: "/dashboard/auditoria", label: "Auditoria", icon: FileClock, show: session.isSuperadmin },
    { href: "/dashboard/conta", label: "Minha conta", icon: UserCog, show: true },
  ].filter((item) => item.show);

  async function signOut() {
    await getBrowserSupabase().auth.signOut();
    router.replace("/dashboard/entrar");
    router.refresh();
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="border-b border-border bg-surface lg:sticky lg:top-0 lg:h-dvh lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-2 p-4">
          <Logo href="/dashboard" />
          <Badge tone="lavender" className="lg:hidden">Painel</Badge>
        </div>
        <div className="px-4 pb-3">
          <p className="font-semibold">{session.displayName}</p>
          <p className="text-sm text-foreground-muted">{session.roles.map((r) => ROLE_LABEL[r]).join(", ")}</p>
          {session.roles.includes("psychologist") && session.credentialStatus !== "verified" && (
            <p className="mt-2 rounded-lg bg-danger-soft p-2 text-xs font-semibold text-danger">
              Credencial aguardando validação administrativa. O acesso a atendimentos fica bloqueado até lá.
            </p>
          )}
          {session.isClinician && <AvailabilityControl className="mt-3" />}
        </div>
        <nav aria-label="Painel" className="overflow-x-auto px-2 pb-2">
          <ul className="flex gap-1 lg:flex-col">
            {nav.map(({ href, label, icon: Icon }) => {
              const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 font-medium whitespace-nowrap text-foreground-muted hover:bg-surface-muted aria-[current=page]:bg-primary-soft aria-[current=page]:text-foreground"
                  >
                    <Icon className="size-5" aria-hidden />
                    {label}
                  </Link>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                onClick={signOut}
                className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 font-medium whitespace-nowrap text-foreground-muted hover:bg-surface-muted"
              >
                <LogOut className="size-5" aria-hidden />
                Sair
              </button>
            </li>
          </ul>
        </nav>
      </aside>
      <main id="conteudo" className="min-w-0 p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
