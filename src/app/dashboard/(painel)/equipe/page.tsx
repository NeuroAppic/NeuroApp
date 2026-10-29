import { redirect } from "next/navigation";
import { StaffManager } from "@/features/dashboard/staff/staff-manager";
import { getStaffSession } from "@/lib/auth/dal";
import { getServerSupabase } from "@/lib/supabase/server";
import type { StaffMember, StaffRole } from "@/types/domain";

export const metadata = { title: "Equipe" };

export default async function EquipePage() {
  const session = await getStaffSession();
  if (!session?.isAdmin) redirect("/dashboard");

  const supabase = await getServerSupabase();
  const [{ data: profiles }, { data: roles }] = await Promise.all([
    supabase
      .from("staff_profiles")
      .select("user_id, full_name, display_name, professional_title, professional_registry, credential_status, is_active, availability, last_seen_at")
      .order("full_name"),
    supabase.from("staff_roles").select("user_id, role"),
  ]);

  const staff: StaffMember[] = (profiles ?? []).map((p) => ({
    ...(p as Omit<StaffMember, "roles">),
    roles: (roles ?? []).filter((r) => r.user_id === p.user_id).map((r) => r.role as StaffRole),
  }));

  return <StaffManager staff={staff} currentUserId={session.userId} isSuperadmin={session.isSuperadmin} />;
}
