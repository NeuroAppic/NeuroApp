"use client";

import { useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocalState } from "./use-local-state";

/** 16 tons suaves em 4 famílias (verde, lavanda, azul, pêssego). */
const PALETTE = [
  "#c8d8cb", "#a9c2ae", "#8aab91", "#6e9477",
  "#ddd5ee", "#c6b9e2", "#ae9dd4", "#9683c4",
  "#cfdae6", "#b2c4d6", "#94adc5", "#7896b3",
  "#f1d9cd", "#e8c2ae", "#dda98f", "#d29172",
];
const COLS = 4;

export function shuffle<T>(items: T[], random = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function swap<T>(items: T[], i: number, j: number): T[] {
  const a = [...items];
  [a[i], a[j]] = [a[j]!, a[i]!];
  return a;
}

const validate = (raw: unknown) =>
  Array.isArray(raw) && raw.length === PALETTE.length && raw.every((c) => PALETTE.includes(c)) ? (raw as string[]) : null;

/**
 * Organização livre: toque em uma peça e depois em outra para trocar.
 * Teclado: setas movem o foco, Enter/Espaço seleciona e troca.
 * Não há tempo, pontos ou "resposta certa".
 */
export function ColorSort() {
  const [tiles, setTiles] = useLocalState<string[]>("acolher:cores:v1", PALETTE, validate);
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  function choose(i: number) {
    if (selected === null) {
      setSelected(i);
      setMessage(`Peça ${i + 1} escolhida. Agora escolha onde colocá-la.`);
    } else if (selected === i) {
      setSelected(null);
      setMessage("Escolha desfeita.");
    } else {
      setTiles(swap(tiles, selected, i));
      setSelected(null);
      setMessage(`Peças ${selected + 1} e ${i + 1} trocadas.`);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS }[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const next = i + delta;
    if (next >= 0 && next < tiles.length) {
      document.getElementById(`peca-${next}`)?.focus();
    }
  }

  return (
    <div className="space-y-5">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-2 sm:gap-3" role="group" aria-label="Peças coloridas">
        {tiles.map((color, i) => (
          <button
            key={`${color}-${i}`}
            id={`peca-${i}`}
            type="button"
            onClick={() => choose(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            aria-pressed={selected === i}
            aria-label={`Peça ${i + 1}${selected === i ? ", escolhida" : ""}`}
            className={cn(
              "aspect-square rounded-2xl transition-transform",
              selected === i && "scale-95 ring-4 ring-focus ring-offset-2 ring-offset-background",
            )}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <p aria-live="polite" className="min-h-6 text-center text-foreground-muted">{message}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="secondary" onClick={() => { setTiles(shuffle(PALETTE)); setSelected(null); setMessage("Peças misturadas."); }}>
          Misturar
        </Button>
        <Button variant="ghost" onClick={() => { setTiles(PALETTE); setSelected(null); setMessage("Peças organizadas por família de cor."); }}>
          Organizar por família
        </Button>
      </div>
    </div>
  );
}
