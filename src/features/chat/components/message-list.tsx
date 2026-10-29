"use client";

import { AlertCircle, ArrowDown, Bot, RotateCcw, UserRound } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn, formatTime } from "@/lib/utils";
import type { ChatMessage } from "@/types/domain";
import type { ChatState } from "../chat-state";

interface Props {
  state: ChatState;
  /** Em baixo estímulo, a resposta aparece inteira (sem texto "digitando"). */
  revealWhole: boolean;
  onRetryMessage: (clientId: string) => void;
}

export function MessageList({ state, revealWhole, onRetryMessage }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const count = state.messages.length + state.pending.length;

  // Só rola automaticamente se a pessoa já estava no fim (não "puxa" a leitura).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [count, state.ai.draft, state.ai.state, atBottom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto overscroll-contain px-3 py-4 sm:px-5"
        role="log"
        aria-label="Histórico da conversa"
        aria-live="off"
      >
        <ol className="mx-auto flex max-w-2xl flex-col gap-3">
          {state.messages.length === 0 && state.pending.length === 0 && (
            <li className="animate-gentle-in self-start">
              <Bubble sender="ai" label="Assistente virtual (IA)">
                Olá. Estou aqui para ouvir você, no seu ritmo. Você pode escrever ou tocar em uma das
                mensagens prontas abaixo.
              </Bubble>
            </li>
          )}

          {state.messages.map((m) => (
            <MessageItem key={m.id} message={m} />
          ))}

          {state.pending.map((p) => (
            <li key={p.clientId} className="self-end">
              <Bubble sender="user" muted={p.state === "sending"}>
                {p.content}
              </Bubble>
              {p.state === "failed" && (
                <button
                  type="button"
                  onClick={() => onRetryMessage(p.clientId)}
                  className="mt-1 ml-auto flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-danger hover:bg-danger-soft"
                >
                  <RotateCcw className="size-4" aria-hidden />
                  {p.error ?? "Não enviada."} Reenviar
                </button>
              )}
            </li>
          ))}

          {state.ai.state !== "idle" && (
            <li className="self-start" aria-hidden={revealWhole || state.ai.state === "thinking"}>
              {state.ai.state === "streaming" && !revealWhole ? (
                <Bubble sender="ai" label="Assistente virtual (IA)">
                  {state.ai.draft}
                </Bubble>
              ) : (
                <TypingIndicator />
              )}
            </li>
          )}
        </ol>
      </div>

      {!atBottom && (
        <button
          type="button"
          onClick={() => {
            const el = scrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
          className="absolute bottom-3 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold shadow-soft"
        >
          <ArrowDown className="size-4" aria-hidden />
          Ir para as mensagens recentes
        </button>
      )}
    </div>
  );
}

function MessageItem({ message }: { message: ChatMessage }) {
  if (message.sender === "system") {
    return (
      <li className="animate-gentle-in mx-auto max-w-md text-center">
        <p className="rounded-xl bg-surface-muted px-4 py-2 text-sm text-foreground-muted">
          {message.content}
          {message.sender_label && (
            <span className="mt-1 block font-semibold text-foreground">{message.sender_label}</span>
          )}
        </p>
      </li>
    );
  }
  const isUser = message.sender === "user";
  return (
    <li className={cn("animate-gentle-in", isUser ? "self-end" : "self-start")}>
      <Bubble
        sender={message.sender}
        label={
          message.sender === "ai"
            ? "Assistente virtual (IA)"
            : message.sender === "staff"
              ? `${message.sender_label ?? "Profissional"} — pessoa da equipe`
              : undefined
        }
        time={message.created_at}
      >
        {message.content}
      </Bubble>
    </li>
  );
}

function Bubble({
  sender,
  label,
  time,
  muted,
  children,
}: {
  sender: ChatMessage["sender"];
  label?: string;
  time?: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  const styles = {
    user: "bg-primary-soft rounded-br-md",
    ai: "bg-surface border border-border rounded-bl-md",
    staff: "bg-lavender-soft rounded-bl-md",
    system: "bg-surface-muted",
  } as const;
  return (
    <div className={cn("max-w-[85vw] sm:max-w-md", muted && "opacity-70")}>
      {label && (
        <p className="mb-1 flex items-center gap-1.5 px-1 text-sm font-semibold text-foreground-muted">
          {sender === "staff" ? <UserRound className="size-4" aria-hidden /> : <Bot className="size-4" aria-hidden />}
          {label}
        </p>
      )}
      <div className={cn("rounded-2xl px-4 py-3 break-words whitespace-pre-wrap", styles[sender])}>
        {sender === "user" && <span className="sr-only">Você: </span>}
        {children}
      </div>
      {time && (
        <p className={cn("mt-1 px-1 text-xs text-foreground-muted", sender === "user" && "text-right")}>
          {formatTime(time)}
        </p>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-foreground-muted">
      <span className="flex gap-1" aria-hidden>
        <span className="animate-soft-pulse size-2 rounded-full bg-foreground-muted" />
        <span className="animate-soft-pulse size-2 rounded-full bg-foreground-muted [animation-delay:200ms]" />
        <span className="animate-soft-pulse size-2 rounded-full bg-foreground-muted [animation-delay:400ms]" />
      </span>
      O assistente está escrevendo…
    </div>
  );
}

export function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm font-medium text-danger">
      <AlertCircle className="size-4" aria-hidden />
      {children}
    </p>
  );
}
