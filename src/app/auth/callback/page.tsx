import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCallback } from "@/features/account/auth-callback";

export const metadata: Metadata = { title: "Entrando…", robots: { index: false } };

export default function AuthCallbackPage() {
  return (
    <main id="conteudo" className="flex min-h-dvh items-center justify-center px-4">
      <Suspense fallback={<p role="status">Confirmando o link…</p>}>
        <AuthCallback />
      </Suspense>
    </main>
  );
}
