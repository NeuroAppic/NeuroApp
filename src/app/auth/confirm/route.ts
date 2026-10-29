import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Confirma links enviados por e-mail (convite da equipe, recuperação de senha,
 * confirmação de conta). Os modelos de e-mail do Supabase devem apontar para:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<tipo>&next=<rota>
 * Ver README → "Configuração do Supabase".
 */
const ALLOWED_NEXT = ["/dashboard", "/conta", "/conversar"];

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next") ?? "/";
  // Evita redirecionamento aberto: só rotas internas conhecidas.
  const next = ALLOWED_NEXT.some((p) => requestedNext === p || requestedNext.startsWith(`${p}/`))
    ? requestedNext
    : "/";

  const supabase = await getServerSupabase();
  let ok = false;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (!ok) return NextResponse.redirect(new URL("/entrar?erro=link", origin));
  const destination = type === "recovery" || type === "invite" ? "/redefinir-senha" : next;
  return NextResponse.redirect(new URL(`${destination}?next=${encodeURIComponent(next)}`, origin));
}
