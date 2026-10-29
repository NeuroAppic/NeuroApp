"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Erro inesperado: mensagem calma, sem detalhes técnicos, com caminhos de ajuda. */
export default function PortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Algo não funcionou</h1>
      <p className="text-foreground-muted">Não foi culpa sua. Você pode tentar de novo ou ver os contatos de ajuda.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>Tentar de novo</Button>
        <Link href="/ajuda" className="inline-flex min-h-12 items-center rounded-xl bg-lavender-soft px-5 font-semibold">Ajuda agora</Link>
      </div>
    </div>
  );
}
