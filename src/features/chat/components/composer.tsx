"use client";

import { SendHorizontal } from "lucide-react";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { MAX_MESSAGE_LENGTH } from "@/lib/validation/schemas";

export function Composer({
  onSend,
  disabled,
  placeholder,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
  placeholder: string;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const trimmed = text.trim();
  const remaining = MAX_MESSAGE_LENGTH - text.length;

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!trimmed || disabled || remaining < 0) return;
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
    <form onSubmit={submit} className="mx-auto flex max-w-2xl items-end gap-2">
      <div className="min-w-0 flex-1">
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
          className="field-sizing-content max-h-40 min-h-13 w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 leading-relaxed placeholder:text-foreground-muted/80 focus-visible:border-focus disabled:opacity-60"
        />
        {remaining < 200 && (
          <p id="contador" className={remaining < 0 ? "text-sm text-danger" : "text-sm text-foreground-muted"}>
            {remaining < 0 ? `${-remaining} caracteres acima do limite` : `${remaining} caracteres restantes`}
          </p>
        )}
      </div>
      <Button type="submit" size="icon" className="size-13 rounded-2xl" disabled={disabled || !trimmed || remaining < 0} aria-label="Enviar mensagem">
        <SendHorizontal aria-hidden />
      </Button>
    </form>
  );
}
