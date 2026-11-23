import { SiteHeader } from "@/components/layout/site-header";

/**
 * Tela da conversa: ocupa a altura da janela (sem rodapé), para o campo de
 * mensagem ficar sempre ao alcance. No celular, reserva o espaço da barra inferior.
 */
export default function ChatLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader />
      <main
        id="conteudo"
        className="flex min-h-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0"
      >
        {children}
      </main>
    </div>
  );
}
