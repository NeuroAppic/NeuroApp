import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";

const bodySchema = z.object({ confirm: z.literal("EXCLUIR") });

/**
 * Encerra a conta (ou sessão de visitante) e apaga os dados:
 *  1. conversas sem obrigação de retenção são excluídas de verdade;
 *  2. conversas sob retenção ficam pseudonimizadas até o fim do prazo;
 *  3. o usuário é removido do Supabase Auth (perfil e preferências em cascata).
 * Cópias de segurança expiram conforme a janela de backup informada na política.
 */
export async function POST(request: NextRequest) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;
  if (!bodySchema.safeParse(await request.json().catch(() => null)).success) {
    return jsonError(400, "confirmation_required", "Confirme digitando EXCLUIR.");
  }

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return jsonError(401, "unauthenticated", "Sessão não encontrada.");

  // Contas da equipe não são excluídas por aqui (exige processo administrativo).
  const { data: staff } = await supabase
    .from("staff_profiles")
    .select("user_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (staff) return jsonError(403, "staff_account", "Contas da equipe são encerradas pela administração.");

  const admin = getAdminSupabase();
  const { data: summary, error } = await admin.rpc("prepare_account_deletion", {
    p_user_id: auth.user.id,
  });
  if (error) return jsonError(500, "deletion_failed", "Não foi possível concluir agora. Tente novamente.");

  const { error: authError } = await admin.auth.admin.deleteUser(auth.user.id);
  if (authError) {
    return jsonError(500, "deletion_failed", "Seus dados foram apagados, mas a sessão não pôde ser removida. Tente de novo.");
  }
  await supabase.auth.signOut();

  return NextResponse.json({ ok: true, summary });
}
