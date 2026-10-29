import "server-only";

import type { User } from "@supabase/supabase-js";
import { cache } from "react";
import { getServerSupabase } from "@/lib/supabase/server";
import type { CredentialStatus, StaffRole } from "@/types/domain";

/**
 * Camada de acesso a dados de autenticação (DAL).
 * Toda verificação de permissão no servidor passa por aqui; o banco aplica
 * as mesmas regras de novo via RLS e funções (defesa em profundidade).
 */

export const getCurrentUser = cache(async (): Promise<User | null> => {
  try {
    const supabase = await getServerSupabase();
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  } catch {
    return null;
  }
});

export interface StaffSession {
  userId: string;
  email: string | null;
  displayName: string;
  fullName: string;
  roles: StaffRole[];
  credentialStatus: CredentialStatus;
  isClinician: boolean;
  isAdmin: boolean;
  isSuperadmin: boolean;
  /** Nível de garantia da sessão (MFA). */
  aal: "aal1" | "aal2" | null;
}

export const getStaffSession = cache(async (): Promise<StaffSession | null> => {
  const user = await getCurrentUser();
  if (!user || user.is_anonymous) return null;
  const supabase = await getServerSupabase();

  const [{ data: profile }, { data: roles }, { data: aal }] = await Promise.all([
    supabase
      .from("staff_profiles")
      .select("display_name, full_name, credential_status, is_active")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("staff_roles").select("role").eq("user_id", user.id),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);

  if (!profile || !profile.is_active) return null;
  const roleList = (roles ?? []).map((r) => r.role as StaffRole);
  if (roleList.length === 0) return null;

  const credentialStatus = profile.credential_status as CredentialStatus;
  return {
    userId: user.id,
    email: user.email ?? null,
    displayName: profile.display_name as string,
    fullName: profile.full_name as string,
    roles: roleList,
    credentialStatus,
    isClinician: roleList.includes("psychologist") && credentialStatus === "verified",
    isAdmin: roleList.includes("admin") || roleList.includes("superadmin"),
    isSuperadmin: roleList.includes("superadmin"),
    aal: (aal?.currentLevel as "aal1" | "aal2" | null | undefined) ?? null,
  };
});

/** MFA é exigida para a equipe quando STAFF_REQUIRE_MFA=true. */
export function staffMfaRequired(): boolean {
  return process.env.STAFF_REQUIRE_MFA === "true";
}
