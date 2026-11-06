import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { displayNameFromEmail, isOpenStaffSignup } from "@/lib/staff-signup-mode";
import { getAdminSupabase } from "@/lib/supabase/admin";

const bodySchema = z.object({
  email: z.email("E-mail inválido.").max(200),
  password: z.string().min(8, "Use pelo menos 8 caracteres.").max(72, "Use até 72 caracteres."),
});

/**
 * Cadastro simplificado de psicólogo (MODO DE TESTE, ver lib/staff-signup-mode).
 * A conta é criada já confirmada (sem e-mail) e com acesso clínico liberado.
 * Com STAFF_OPEN_SIGNUP desligado, esta rota não existe na prática (404).
 */
export async function POST(request: NextRequest) {
  if (!isOpenStaffSignup()) return jsonError(404, "not_found", "Cadastro simplificado desativado.");
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, "invalid_input", parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }
  const email = parsed.data.email.trim().toLowerCase();

  const admin = getAdminSupabase();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: parsed.data.password,
    email_confirm: true,
  });
  if (error || !created.user) {
    const exists = error?.message.toLowerCase().includes("already") || error?.status === 422;
    return exists
      ? jsonError(409, "already_registered", "Este e-mail já tem cadastro. Use “Entrar”.")
      : jsonError(500, "signup_failed", "Não foi possível criar o cadastro agora. Tente novamente.");
  }

  const userId = created.user.id;
  const name = displayNameFromEmail(email);
  const { error: profileError } = await admin.from("staff_profiles").insert({
    user_id: userId,
    full_name: name,
    display_name: name,
    credential_status: "verified",
  });
  const { error: roleError } = profileError
    ? { error: profileError }
    : await admin.from("staff_roles").insert({ user_id: userId, role: "psychologist" });
  if (profileError || roleError) {
    await admin.auth.admin.deleteUser(userId);
    return jsonError(500, "signup_failed", "Não foi possível criar o cadastro agora. Tente novamente.");
  }

  await admin.from("audit_logs").insert({
    actor_id: userId,
    actor_kind: "system",
    action: "staff.test_signup",
    target_type: "staff",
    target_id: userId,
  });

  return NextResponse.json({ ok: true });
}
