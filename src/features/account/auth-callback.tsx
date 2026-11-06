"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { passwordSetupPath, safeNext } from "@/lib/safe-redirect";
import { getBrowserSupabase } from "@/lib/supabase/client";

/**
 * Links de convite gerados pelo painel trazem a sessão depois do "#"
 * (o servidor não vê essa parte da URL). Aqui o navegador lê o token,
 * abre a sessão e leva a pessoa para definir a senha.
 */
export function AuthCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const type = hash.get("type");
    const next = safeNext(params.get("next"), "/dashboard");

    if (!accessToken || !refreshToken || hash.get("error")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resultado da leitura da URL
      setFailed(true);
      return;
    }

    void (async () => {
      const { error } = await getBrowserSupabase().auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      // Remove o token da barra de endereço e do histórico.
      window.history.replaceState(null, "", window.location.pathname);
      if (error) {
        setFailed(true);
        return;
      }
      router.replace(type === "invite" || type === "recovery" ? passwordSetupPath(next) : next);
      router.refresh();
    })();
  }, [params, router]);

  if (failed) {
    return (
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold">Este link não funcionou</h1>
        <p className="mt-2 text-foreground-muted">
          Ele pode ter expirado ou já ter sido usado. Peça um novo convite ou use “Esqueci minha senha”.
        </p>
        <Link href="/dashboard/entrar" className="mt-4 inline-flex min-h-12 items-center font-semibold text-primary underline">
          Ir para a entrada da equipe
        </Link>
      </div>
    );
  }
  return <p role="status">Confirmando o link…</p>;
}
