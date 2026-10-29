import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";

export default function PortalLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="conteudo" className="flex-1 pb-24 md:pb-8">
        {children}
      </main>
      <footer className="mb-20 border-t border-border/70 md:mb-0">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-foreground-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>Esta plataforma não é um serviço de emergência. Em perigo imediato, ligue 192 (SAMU).</p>
          <nav aria-label="Rodapé" className="flex flex-wrap gap-x-4 gap-y-1">
            <Link className="underline-offset-4 hover:underline" href="/privacidade">
              Privacidade
            </Link>
            <Link className="underline-offset-4 hover:underline" href="/termos">
              Termos de uso
            </Link>
            <Link className="underline-offset-4 hover:underline" href="/dashboard">
              Área da equipe
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
