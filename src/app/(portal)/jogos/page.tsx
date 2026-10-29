import { Brush, Flower2, Grid3x3, Sparkles, Wind } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { GAMES } from "@/features/games/catalog";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Jogos tranquilos" };

const ICONS = { jardim: Flower2, cores: Grid3x3, bolhas: Sparkles, desenho: Brush, respiracao: Wind } as const;

export default function JogosPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-3xl font-bold">Jogos tranquilos</h1>
      <p className="mt-2 max-w-2xl text-foreground-muted">
        Atividades opcionais para se distrair um pouco. Sem pontos, sem tempo e sem como perder. Você
        pode sair quando quiser.
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GAMES.map((game) => {
          const Icon = ICONS[game.slug];
          return (
            <li key={game.slug}>
              <Link
                href={`/jogos/${game.slug}`}
                className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-soft hover:bg-surface-muted"
              >
                <span className={cn("inline-flex size-12 items-center justify-center rounded-xl", game.tone)}>
                  <Icon className="size-6" aria-hidden />
                </span>
                <span className="text-lg font-semibold">{game.title}</span>
                <span className="text-foreground-muted">{game.summary}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
