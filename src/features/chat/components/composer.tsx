"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { MAX_MESSAGE_LENGTH } from "@/lib/validation/schemas";

export function Composer({
  onSend,
  disabled,
  placeholder,
  autoFocus,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const trimmed = text.trim();
  const remaining = MAX_MESSAGE_LENGTH - text.length;
  const canSend = !disabled && trimmed.length > 0 && remaining >= 0;

  // Com mouse/teclado, o cursor já fica no campo. No celular não: abrir o
  // teclado sozinho cobriria metade da tela antes de a pessoa decidir escrever.
  useEffect(() => {
    if (autoFocus && window.matchMedia("(pointer: fine)").matches) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    onSend(trimmed);
    setText("");
    ref.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia; Shift+Enter quebra linha. Em teclados virtuais, o botão envia.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-2xl">
      <div
        className={cn(
          "flex items-end gap-2 rounded-2xl border border-border bg-surface p-1.5 pl-4 shadow-soft transition-colors",
          "focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20",
          disabled && "opacity-70",
        )}
      >
        <label htmlFor="mensagem" className="sr-only">
          Sua mensagem
        </label>
        <textarea
          id="mensagem"
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          disabled={disabled}
          placeholder={placeholder}
          aria-describedby={remaining < 200 ? "contador" : undefined}
          className="field-sizing-content max-h-40 min-h-11 flex-1 resize-none self-center bg-transparent py-2.5 leading-relaxed placeholder:text-foreground-muted focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Enviar mensagem"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary-hover disabled:bg-surface-muted disabled:text-foreground-muted"
        >
          <ArrowUp className="size-5" strokeWidth={2.25} aria-hidden />
        </button>
      </div>
      {remaining < 200 && (
        <p id="contador" className={cn("mt-1 px-2 text-sm", remaining < 0 ? "text-danger" : "text-foreground-muted")}>
          {remaining < 0 ? `${-remaining} caracteres acima do limite` : `${remaining} caracteres restantes`}
        </p>
      )}
    </form>
  );
}
