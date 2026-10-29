import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** Moldura comum: título, instrução curta e um botão "Sair" sempre visível. */
export function GameFrame({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        <Link
          href="/jogos"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 font-semibold hover:bg-surface-muted"
        >
          <ArrowLeft className="size-5" aria-hidden /> Sair
        </Link>
      </div>
      <p className="mt-2 text-foreground-muted">{hint}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}
