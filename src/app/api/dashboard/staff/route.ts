import { NextResponse, type NextRequest } from "next/server";
import { getStaffSession } from "@/lib/auth/dal";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";
import { staffInviteSchema } from "@/lib/validation/schemas";

/**
 * Convida um profissional por e-mail (Supabase Auth) e registra o perfil.
 * Autorização: sessão de administrador verificada aqui E de novo no banco
 * (admin_register_staff, executada com a sessão de quem convida → auditoria).
 */
export async function POST(request: NextRequest) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  const session = await getStaffSession();
  if (!session?.isAdmin) return jsonError(403, "forbidden", "Apenas administradores podem convidar.");

  const parsed = staffInviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, "invalid_input", parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }
  const input = parsed.data;
  if ((input.roles.includes("admin") || input.roles.includes("superadmin")) && !session.isSuperadmin) {
    return jsonError(403, "forbidden", "Apenas superadministradores concedem papéis administrativos.");
  }

  const admin = getAdminSupabase();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(input.email, {
    redirectTo: `${siteUrl}/auth/confirm?next=/dashboard/conta`,
  });
  if (inviteError || !invited.user) {
    return jsonError(409, "invite_failed", "Não foi possível convidar este e-mail. Ele pode já estar cadastrado.");
  }

  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("admin_register_staff", {
    p_user_id: invited.user.id,
    p_full_name: input.fullName,
    p_display_name: input.displayName,
    p_professional_title: input.professionalTitle,
    p_professional_registry: input.professionalRegistry,
    p_roles: input.roles,
  });
  if (error) {
    // Desfaz o convite para não deixar usuário órfão no Auth.
    await admin.auth.admin.deleteUser(invited.user.id);
    return jsonError(400, "register_failed", "Convite cancelado: dados do profissional inválidos.");
  }

  return NextResponse.json({ ok: true, userId: invited.user.id });
}
