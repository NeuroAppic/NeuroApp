import { NextResponse, type NextRequest } from "next/server";
import { getStaffSession } from "@/lib/auth/dal";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";
import { displayNameFromEmail, staffCreateSchema } from "@/lib/validation/schemas";

/**
 * O administrador cria a conta de um profissional com e-mail e senha.
 * A conta nasce confirmada (sem e-mail de convite) e ativa: a pessoa entra
 * em /dashboard/entrar e já pode atender.
 *
 * Autorização: sessão de administrador verificada aqui E de novo no banco
 * (admin_register_staff, executada com a sessão de quem cria → auditoria).
 */
export async function POST(request: NextRequest) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  const session = await getStaffSession();
  if (!session?.isAdmin) return jsonError(403, "forbidden", "Apenas administradores podem cadastrar a equipe.");

  const parsed = staffCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, "invalid_input", parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }
  const input = parsed.data;
  if ((input.roles.includes("admin") || input.roles.includes("superadmin")) && !session.isSuperadmin) {
    return jsonError(403, "forbidden", "Apenas superadministradores concedem papéis administrativos.");
  }
  const email = input.email.trim().toLowerCase();

  const admin = getAdminSupabase();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    const exists = createError?.status === 422 || /already/i.test(createError?.message ?? "");
    return exists
      ? jsonError(409, "already_registered", "Este e-mail já tem uma conta.")
      : jsonError(500, "create_failed", "Não foi possível criar a conta agora. Tente novamente.");
  }

  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("admin_register_staff", {
    p_user_id: created.user.id,
    p_display_name: input.displayName || displayNameFromEmail(email),
    p_roles: input.roles,
  });
  if (error) {
    // Desfaz a conta para não deixar usuário órfão no Auth.
    await admin.auth.admin.deleteUser(created.user.id);
    return jsonError(400, "register_failed", "Não foi possível registrar o profissional. Nada foi criado.");
  }

  return NextResponse.json({ ok: true, userId: created.user.id });
}
