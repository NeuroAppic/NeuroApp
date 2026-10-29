"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { QuickMessage } from "@/types/domain";
import { FALLBACK_QUICK_MESSAGES, QUICK_CATEGORIES } from "../content";

function useQuickMessages(): QuickMessage[] {
  const [items, setItems] = useState<QuickMessage[]>(FALLBACK_QUICK_MESSAGES);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await getBrowserSupabase()
          .from("quick_messages")
          .select("id, category, label, message, sort_order")
          .eq("is_active", true)
          .order("sort_order");
        if (!cancelled && data && data.length > 0) setItems(data as QuickMessage[]);
      } catch {
        // mantém as mensagens padrão
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return items;
}

/** Mensagens prontas em botões grandes, organizadas em poucas categorias. */
export function QuickMessages({
  onSelect,
  disabled,
}: {
  onSelect: (message: QuickMessage) => void;
  disabled: boolean;
}) {
  const items = useQuickMessages();
  const [category, setCategory] = useState<QuickMessage["category"]>("essenciais");
  const visible = items.filter((i) => i.category === category);

  return (
    <div className="border-t border-border bg-surface-muted/60 px-3 pt-3 pb-2 sm:px-5">
      <div className="mx-auto max-w-2xl">
        <div role="tablist" aria-label="Categorias de mensagens prontas" className="flex gap-2 overflow-x-auto pb-2">
          {QUICK_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              id={`tab-${c.id}`}
              aria-selected={category === c.id}
              aria-controls="painel-mensagens-prontas"
              onClick={() => setCategory(c.id)}
              className={cn(
                "min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold",
                category === c.id ? "bg-primary text-primary-foreground" : "bg-surface text-foreground-muted",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div
          id="painel-mensagens-prontas"
          role="tabpanel"
          aria-labelledby={`tab-${category}`}
          className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto pb-1 min-[400px]:grid-cols-2"
        >
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(item)}
              className="min-h-13 rounded-xl border border-border bg-surface px-4 py-2 text-left font-semibold hover:bg-primary-soft disabled:opacity-55"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
