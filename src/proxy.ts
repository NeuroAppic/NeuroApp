import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

/**
 * Renova a sessão do Supabase a cada navegação e protege /dashboard.
 * A autorização definitiva (papéis, permissões) acontece no servidor e no
 * banco (RLS); este proxy só evita renderizar o painel sem sessão.
 */
export async function proxy(request: NextRequest) {
  const config = getSupabasePublicConfig();
  let response = NextResponse.next({ request });
  if (!config) return response;

  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() valida o token com o servidor de Auth (não confia só no cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isDashboard = pathname.startsWith("/dashboard");
  const isLogin = pathname === "/dashboard/entrar" || pathname.startsWith("/dashboard/entrar/");

  if (isDashboard && !isLogin && (!user || user.is_anonymous)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard/entrar";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|ogg|wav)$).*)",
  ],
};
