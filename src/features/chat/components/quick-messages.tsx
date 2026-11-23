"use client";

import { Hand } from "lucide-react";
import { QUICK_SUGGESTIONS, type QuickSuggestion } from "../content";

const chip =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:border-accent/40 hover:bg-primary-soft disabled:opacity-55";

/**
 * No máximo três atalhos discretos para começar. Somem depois da primeira
 * mensagem; escrever continua sendo o caminho principal.
 */
export function QuickSuggestions({
  onSelect,
  onAnswerWithTaps,
  disabled,
}: {
  onSelect: (suggestion: QuickSuggestion) => void;
  /** Abre as perguntas de um toque (para quem não consegue escrever agora). */
  onAnswerWithTaps: () => void;
  disabled: boolean;
}) {
  return (
    <ul aria-label="Sugestões para começar" className="flex flex-wrap justify-center gap-2">
      {QUICK_SUGGESTIONS.map((item) => (
        <li key={item.label}>
          <button type="button" className={chip} disabled={disabled} onClick={() => onSelect(item)}>
            {item.label}
          </button>
        </li>
      ))}
      <li>
        <button type="button" className={chip} disabled={disabled} onClick={onAnswerWithTaps}>
          <Hand className="size-4 text-foreground-muted" aria-hidden />
          Responder com toques
        </button>
      </li>
    </ul>
  );
}
