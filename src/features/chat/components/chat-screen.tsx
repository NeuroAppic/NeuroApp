"use client";

import { Bot, MoreHorizontal, UserRound, WifiOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { LogoMark } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/notice";
import { useReducedMotion } from "@/lib/preferences/use-reduced-motion";
import { cn } from "@/lib/utils";
import type { ChatState } from "../chat-state";
import { useChat } from "../use-chat";
import { Composer } from "./composer";
import { GuidedFlow } from "./guided-flow";
import { MessageList } from "./message-list";
import { QuickSuggestions } from "./quick-messages";
import { AIUnavailableNotice, HumanSupportPanel, SafetyPanel, SimulatedBadgeNotice } from "./support-panels";

/**
 * A conversa abre pronta para escrever: sem tela de boas-vindas nem
 * confirmação. O aviso sobre IA, privacidade e emergência fica junto ao
 * campo de mensagem até a conversa começar, e o cabeçalho sempre diz se
 * quem responde é a IA ou uma pessoa.
 */
export function ChatScreen() {
  const chat = useChat();
  const { state } = chat;
  const reducedMotion = useReducedMotion();
  const [guidedOpen, setGuidedOpen] = useState(false);

  if (state.phase === "unavailable") {
    return (
      <div className="mx-auto w-full max-w-xl p-4 py-10">
        <Notice tone="sky" icon={<WifiOff aria-hidden />}>
          <p className="font-semibold">A conversa não está disponível neste momento.</p>
          <p className="mt-1">
            Você pode ver os <Link className="font-semibold underline" href="/ajuda">contatos de ajuda</Link>, ouvir{" "}
            <Link className="font-semibold underline" href="/sons">sons</Link> ou usar os{" "}
            <Link className="font-semibold underline" href="/jogos">jogos tranquilos</Link>.
          </p>
        </Notice>
      </div>
    );
  }

  const checking = state.phase === "checking";
  const starting = state.phase === "starting";
  const hasConversation = state.conversationId !== null;
  const isClosed = state.status === "closed" || state.status === "archived";
  const humanActive = state.status === "human_active";
  const canAskHuman = state.status === "ai_active" && !checking && !starting;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatHeader
        state={state}
        canAskHuman={canAskHuman}
        onRequestHuman={() => void chat.requestHuman()}
        menu={
          <ChatMenu
            canClose={hasConversation && !isClosed}
            onClose={chat.closeConversation}
            onAnswerWithTaps={isClosed ? undefined : () => setGuidedOpen(true)}
          />
        }
      />

      {state.simulated && <SimulatedBadgeNotice />}
      {state.connection === "reconnecting" || state.connection === "offline" ? (
        <p role="status" className="bg-surface-muted px-3 py-1.5 text-center text-sm text-foreground-muted">
          {state.connection === "offline" ? "Sem internet. Suas mensagens serão recuperadas ao voltar." : "Reconectando…"}
        </p>
      ) : null}
      <SafetyPanel state={state} onHide={chat.dismissSafety} />
      <HumanSupportPanel state={state} onCancel={chat.cancelHumanRequest} />

      <MessageList
        state={state}
        revealWhole={reducedMotion}
        onRetryMessage={chat.retryMessage}
        emptyState={
          checking ? (
            <p role="status" className="py-16 text-center text-foreground-muted">
              Carregando…
            </p>
          ) : (
            <EmptyState>
              {!guidedOpen && !isClosed && (
                <QuickSuggestions
                  disabled={starting}
                  onSelect={(s) => void chat.send(s.message, "quick")}
                  onAnswerWithTaps={() => setGuidedOpen(true)}
                />
              )}
            </EmptyState>
          )
        }
      />

      {/* Anúncios para leitores de tela: apenas mensagens recebidas. */}
      <p className="sr-only" aria-live="polite">
        {state.announcement}
      </p>

      {starting && state.pending.length === 0 && (
        <p role="status" className="mx-auto mb-2 w-full max-w-2xl px-4 text-center text-sm text-foreground-muted">
          Abrindo a conversa…
        </p>
      )}
      <AIUnavailableNotice state={state} onRetry={chat.retryAI} onRequestHuman={chat.requestHuman} />
      {state.notice && (
        <p role="alert" className="mx-auto mb-2 w-full max-w-2xl px-4 text-sm font-medium text-danger">
          {state.notice}
        </p>
      )}

      {isClosed ? (
        <div className="border-t border-border bg-surface px-4 py-4">
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Esta conversa foi encerrada.</p>
              <Link href="/conta" className="text-sm text-foreground-muted underline underline-offset-4">
                Histórico e privacidade
              </Link>
            </div>
            <Button onClick={chat.startNew}>Começar nova conversa</Button>
          </div>
        </div>
      ) : (
        <>
          {guidedOpen && (
            <GuidedFlow
              onSend={(text) => void chat.send(text, "guided")}
              onRequestHuman={() => canAskHuman && void chat.requestHuman()}
              onClose={() => setGuidedOpen(false)}
            />
          )}
          <div className="px-3 pt-2 pb-3 sm:px-6 sm:pb-5">
            <Composer
              onSend={(text) => void chat.send(text)}
              disabled={checking || starting}
              autoFocus={!hasConversation}
              placeholder={humanActive ? "Escreva para o profissional…" : "Escreva o que quiser, no seu ritmo…"}
            />
            {!hasConversation && <FirstMessageNotice />}
          </div>
        </>
      )}
    </div>
  );
}

function ChatHeader({
  state,
  canAskHuman,
  onRequestHuman,
  menu,
}: {
  state: ChatState;
  canAskHuman: boolean;
  onRequestHuman: () => void;
  menu: React.ReactNode;
}) {
  const humanActive = state.status === "human_active";
  const subtitle = humanActive
    ? "Pessoa da equipe"
    : state.status === "waiting_human"
      ? "Aguardando uma pessoa da equipe"
      : state.status === "closed" || state.status === "archived"
        ? "Conversa encerrada"
        : null;

  return (
    <div className="border-b border-border px-3 py-2 sm:px-6">
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <span
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-full",
            humanActive ? "bg-lavender-soft text-lavender" : "bg-primary-soft text-accent",
          )}
          aria-hidden
        >
          {humanActive ? <UserRound className="size-[1.125rem]" /> : <Bot className="size-[1.125rem]" />}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="flex min-w-0 items-center gap-2 leading-tight font-semibold">
            {humanActive ? (
              <span className="truncate">{state.assignedLabel ?? "Profissional da equipe"}</span>
            ) : (
              <>
                Assistente virtual
                <span className="rounded-md border border-border px-1.5 text-xs font-semibold text-foreground-muted">IA</span>
              </>
            )}
          </h1>
          <p className="truncate text-sm text-foreground-muted">
            {subtitle ?? (
              <>
                <span className="hidden sm:inline">Inteligência artificial — não é uma pessoa</span>
                <span className="sm:hidden">Não é uma pessoa</span>
              </>
            )}
          </p>
        </div>
        {canAskHuman && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRequestHuman}
            aria-label="Falar com uma pessoa"
            className="text-accent"
          >
            <UserRound aria-hidden />
            <span className="hidden sm:inline">Falar com uma pessoa</span>
          </Button>
        )}
        {menu}
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-gentle-in mx-auto flex h-full max-w-md flex-col items-center justify-center gap-5 py-10 text-center">
      <LogoMark size={64} className="rounded-2xl" />
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-balance">Como você está agora?</h2>
        <p className="mt-2 text-foreground-muted text-pretty">Escreva do seu jeito, no seu tempo.</p>
      </div>
      {children}
    </div>
  );
}

/** Transparência antes da primeira mensagem: discreta, mas sempre visível. */
function FirstMessageNotice() {
  return (
    <p className="mx-auto mt-2.5 max-w-2xl px-2 text-center text-xs leading-relaxed text-foreground-muted">
      Você conversa com uma IA, não com uma pessoa. As mensagens ficam salvas e a equipe pode lê-las para
      oferecer apoio. Ao enviar, você concorda com a{" "}
      <Link href="/privacidade" className="font-semibold underline underline-offset-2 hover:text-foreground">
        Política de privacidade
      </Link>{" "}
      e os{" "}
      <Link href="/termos" className="font-semibold underline underline-offset-2 hover:text-foreground">
        Termos
      </Link>
      . Em emergência, ligue{" "}
      <a href="tel:192" className="font-semibold underline underline-offset-2 hover:text-foreground">
        192
      </a>{" "}
      ou{" "}
      <a href="tel:188" className="font-semibold underline underline-offset-2 hover:text-foreground">
        188
      </a>
      .
    </p>
  );
}

function ChatMenu({
  canClose,
  onClose,
  onAnswerWithTaps,
}: {
  canClose: boolean;
  onClose: () => void;
  onAnswerWithTaps?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const item =
    "inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-border font-semibold hover:bg-surface-muted disabled:opacity-55";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Mais opções da conversa">
          <MoreHorizontal aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Opções da conversa</DialogTitle>
        <DialogDescription>Nada acontece sem a sua confirmação.</DialogDescription>
        <div className="mt-5 flex flex-col gap-3">
          {onAnswerWithTaps && (
            <button
              type="button"
              className={item}
              onClick={() => {
                onAnswerWithTaps();
                setOpen(false);
              }}
            >
              Responder com toques
            </button>
          )}
          <button
            type="button"
            className={item}
            disabled={!canClose}
            onClick={() => {
              onClose();
              setOpen(false);
            }}
          >
            Encerrar esta conversa
          </button>
          <Link href="/conta" className={item}>
            Apagar histórico e privacidade
          </Link>
          <Link href="/configuracoes" className={item}>
            Preferências de comunicação
          </Link>
          <p className="flex justify-center gap-4 pt-1 text-sm text-foreground-muted">
            <Link href="/privacidade" className="underline underline-offset-4 hover:text-foreground">
              Privacidade
            </Link>
            <Link href="/termos" className="underline underline-offset-4 hover:text-foreground">
              Termos de uso
            </Link>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
