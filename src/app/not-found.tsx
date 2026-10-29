import Link from "next/link";

export default function NotFound() {
  return (
    <main id="conteudo" className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-3xl font-bold">Página não encontrada</h1>
      <p className="text-foreground-muted">Tudo bem. Você pode voltar ao início ou ir direto para a conversa.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/" className="inline-flex min-h-12 items-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground">Início</Link>
        <Link href="/ajuda" className="inline-flex min-h-12 items-center rounded-xl bg-lavender-soft px-5 font-semibold">Ajuda agora</Link>
      </div>
    </main>
  );
}
