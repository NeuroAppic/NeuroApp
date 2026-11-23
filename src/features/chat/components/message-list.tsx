"use client";

import { AlertCircle, ArrowDown, Bot, RotateCcw, UserRound } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn, formatTime } from "@/lib/utils";
import type { ChatMessage } from "@/types/domain";
import type { ChatState } from "../chat-state";

interface Props {
  state: ChatState;
  /** Em baixo estímulo, a resposta aparece inteira (sem texto "digitando"). */
  revealWhole: boolean;
  onRetryMessage: (clientId: string) => void;
  /** Mostrado no lugar da lista enquanto não há nenhuma mensagem. */
  emptyState?: ReactNode;
}

const AI_LABEL = "Assistente virtual (IA)";

/** Quem fala: mensagens seguidas da mesma pessoa formam um grupo com um só rótulo. */
function speakerKey(message: Pick<ChatMessage, "sender" | "sender_label">): string {
  return message.sender === "staff" ? `staff:${message.sender_label ?? ""}` : message.sender;
}

export function MessageList({ state, revealWhole, onRetryMessage, emptyState }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const count = state.messages.length + state.pending.length;
  const isEmpty = count === 0 && state.ai.state === "idle";

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

  const lastMessage = state.messages.at(-1);
  const lastSpeaker = state.pending.length > 0 ? "user" : lastMessage ? speakerKey(lastMessage) : null;

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto overscroll-contain px-4 sm:px-6"
        role="log"
        aria-label="Histórico da conversa"
        aria-live="off"
      >
        {isEmpty && emptyState ? (
          emptyState
        ) : (
          <ol className="mx-auto flex max-w-2xl flex-col py-5">
            {state.messages.map((m, i) => {
              const prev = state.messages[i - 1];
              const next = state.messages[i + 1];
              return (
                <MessageItem
                  key={m.id}
                  message={m}
                  startsGroup={!prev || speakerKey(prev) !== speakerKey(m)}
                  endsGroup={!next || speakerKey(next) !== speakerKey(m)}
                />
              );
            })}

            {state.pending.map((p, i) => (
              <li
                key={p.clientId}
                className={cn("flex flex-col items-end", i === 0 && lastMessage?.sender !== "user" ? "mt-4" : "mt-1")}
              >
                <Bubble sender="user" muted={p.state === "sending"}>
                  {p.content}
                </Bubble>
                {p.state === "sending" && <span className="sr-only">Enviando</span>}
                {p.state === "failed" && (
                  <button
                    type="button"
                    onClick={() => onRetryMessage(p.clientId)}
                    className="mt-1 flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-danger hover:bg-danger-soft"
                  >
                    <RotateCcw className="size-4" aria-hidden />
                    {p.error ?? "Não enviada."} Reenviar
                  </button>
                )}
              </li>
            ))}

            {state.ai.state !== "idle" && (
              <li className="mt-4 flex flex-col items-start" aria-hidden={revealWhole || state.ai.state === "thinking"}>
                {state.ai.state === "streaming" && !revealWhole ? (
                  <>
                    {lastSpeaker !== "ai" && <SpeakerLabel sender="ai">{AI_LABEL}</SpeakerLabel>}
                    <Bubble sender="ai">{state.ai.draft}</Bubble>
                  </>
                ) : (
                  <TypingIndicator />
                )}
              </li>
            )}
          </ol>
        )}
      </div>

      {!atBottom && (
        <button
          type="button"
          onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })}
          className="absolute bottom-3 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold shadow-soft"
        >
          <ArrowDown className="size-4" aria-hidden />
          Ir para as mensagens recentes
        </button>
      )}
    </div>
  );
}

function MessageItem({
  message,
  startsGroup,
  endsGroup,
}: {
  message: ChatMessage;
  startsGroup: boolean;
  endsGroup: boolean;
}) {
  if (message.sender === "system") {
    return (
      <li className="animate-gentle-in my-4 flex justify-center">
        <p className="max-w-md rounded-full bg-surface-muted px-4 py-1.5 text-center text-sm text-foreground-muted">
          {message.content}
          {message.sender_label && <span className="font-semibold text-foreground"> · {message.sender_label}</span>}
        </p>
      </li>
    );
  }
  const isUser = message.sender === "user";
  return (
    <li className={cn("animate-gentle-in flex flex-col", isUser ? "items-end" : "items-start", startsGroup ? "mt-4" : "mt-1")}>
      {startsGroup && !isUser && (
        <SpeakerLabel sender={message.sender}>
          {message.sender === "ai" ? AI_LABEL : `${message.sender_label ?? "Profissional"} — pessoa da equipe`}
        </SpeakerLabel>
      )}
      <Bubble sender={message.sender}>{message.content}</Bubble>
      {endsGroup && (
        <time dateTime={message.created_at} className="mt-1 px-1 text-xs text-foreground-muted">
          {formatTime(message.created_at)}
        </time>
      )}
    </li>
  );
}

function SpeakerLabel({ sender, children }: { sender: ChatMessage["sender"]; children: ReactNode }) {
  return (
    <p className="mb-1 flex items-center gap-1.5 px-1 text-xs font-semibold text-foreground-muted">
      {sender === "staff" ? <UserRound className="size-3.5" aria-hidden /> : <Bot className="size-3.5" aria-hidden />}
      {children}
    </p>
  );
}

function Bubble({
  sender,
  muted,
  children,
}: {
  sender: ChatMessage["sender"];
  muted?: boolean;
  children: ReactNode;
}) {
  const styles = {
    user: "bg-primary-soft rounded-br-md",
    ai: "bg-surface border border-border rounded-bl-md",
    staff: "bg-lavender-soft rounded-bl-md",
    system: "bg-surface-muted",
  } as const;
  return (
    <div
      className={cn(
        "max-w-[85%] rounded-2xl px-4 py-2.5 leading-relaxed break-words whitespace-pre-wrap transition-opacity sm:max-w-[75%]",
        styles[sender],
        muted && "opacity-60",
      )}
    >
      {sender === "user" && <span className="sr-only">Você: </span>}
      {children}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3.5">
      <span className="sr-only">O assistente está escrevendo…</span>
      <span className="animate-soft-pulse size-1.5 rounded-full bg-foreground-muted" aria-hidden />
      <span className="animate-soft-pulse size-1.5 rounded-full bg-foreground-muted [animation-delay:200ms]" aria-hidden />
      <span className="animate-soft-pulse size-1.5 rounded-full bg-foreground-muted [animation-delay:400ms]" aria-hidden />
    </div>
  );
}

export function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm font-medium text-danger">
      <AlertCircle className="size-4" aria-hidden />
      {children}
    </p>
  );
}
