import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import { PREFERENCES_BOOT_SCRIPT } from "@/lib/preferences/preferences";
import { PreferencesProvider } from "@/lib/preferences/preferences-provider";
import "./globals.css";

// Fonte projetada para máxima legibilidade (Braille Institute).
const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Acolher — um espaço tranquilo para conversar", template: "%s · Acolher" },
  description:
    "Espaço de acolhimento emocional: conversa com assistente virtual, apoio humano quando disponível, sons relaxantes e atividades tranquilas.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#18171d" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={atkinson.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <a
          href="#conteudo"
          className="sr-only-focusable fixed top-2 left-2 z-[100] rounded-xl bg-surface px-4 py-3 font-semibold shadow-soft"
        >
          Ir para o conteúdo
        </a>
        <PreferencesProvider>{children}</PreferencesProvider>
      </body>
    </html>
  );
}
