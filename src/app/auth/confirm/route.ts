import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { passwordSetupPath, safeNext } from "@/lib/safe-redirect";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Confirma links enviados por e-mail que chegam ao servidor:
 *  - `?code=` (fluxo PKCE: confirmação de cadastro e recuperação de senha
 *    pedidas pelo próprio navegador);
 *  - `?token_hash=&type=` (modelos de e-mail personalizados).
 * Convites criados pelo painel chegam com o token após "#" e são tratados
 * em /auth/callback, no navegador.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  const supabase = await getServerSupabase();
  let ok = false;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (!ok) {
    const failure = next.startsWith("/dashboard") ? "/dashboard/entrar?motivo=link" : "/entrar?erro=link";
    return NextResponse.redirect(new URL(failure, origin));
  }
  const destination = type === "recovery" || type === "invite" ? passwordSetupPath(next) : next;
  return NextResponse.redirect(new URL(destination, origin));
}
