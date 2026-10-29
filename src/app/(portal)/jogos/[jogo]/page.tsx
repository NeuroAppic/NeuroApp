import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breathing } from "@/features/games/breathing";
import { Bubbles } from "@/features/games/bubbles";
import { GAMES } from "@/features/games/catalog";
import { ColorSort } from "@/features/games/color-sort";
import { Drawing } from "@/features/games/drawing";
import { GameFrame } from "@/features/games/game-frame";
import { Garden } from "@/features/games/garden";

const HINTS: Record<(typeof GAMES)[number]["slug"], string> = {
  jardim: "Escolha uma ferramenta e toque nos canteiros. Suas plantas ficam guardadas neste aparelho.",
  cores: "Toque em uma peça e depois em outra para trocar de lugar. Não existe jeito certo.",
  bolhas: "Toque nas bolhas se quiser. Elas também podem só passar.",
  desenho: "Desenhe com o dedo, a caneta ou o mouse. O teclado também funciona.",
  respiracao: "Um exercício opcional, sem prender a respiração.",
};

const COMPONENTS = { jardim: Garden, cores: ColorSort, bolhas: Bubbles, desenho: Drawing, respiracao: Breathing } as const;

export function generateStaticParams() {
  return GAMES.map((g) => ({ jogo: g.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/jogos/[jogo]">): Promise<Metadata> {
  const { jogo } = await params;
  return { title: GAMES.find((g) => g.slug === jogo)?.title ?? "Jogo" };
}

export default async function JogoPage({ params }: PageProps<"/jogos/[jogo]">) {
  const { jogo } = await params;
  const game = GAMES.find((g) => g.slug === jogo);
  if (!game) notFound();
  const Component = COMPONENTS[game.slug];
  return (
    <GameFrame title={game.title} hint={HINTS[game.slug]}>
      <Component />
    </GameFrame>
  );
}
