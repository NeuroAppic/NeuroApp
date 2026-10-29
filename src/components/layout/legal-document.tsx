import type { ReactNode } from "react";

export function LegalDocument({ title, updatedAt, children }: { title: string; updatedAt: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="mb-4 rounded-xl bg-sky-soft p-3 text-sm font-semibold">
        Rascunho inicial — precisa de revisão jurídica especializada antes do lançamento público.
      </p>
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-foreground-muted">Atualizado em {updatedAt}</p>
      <div className="mt-6 space-y-4 leading-relaxed [&_a]:font-semibold [&_a]:text-primary [&_a]:underline [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </article>
  );
}
