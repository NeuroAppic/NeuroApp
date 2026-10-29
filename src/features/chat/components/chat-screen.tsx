"use client";

import { Bot, HandHeart, LifeBuoy, MessageSquareText, MoreVertical, UserRound, WifiOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/notice";
import { useReducedMotion } from "@/lib/preferences/use-reduced-motion";
import type { QuickMessage } from "@/types/domain";
import { HUMAN_REQUEST_PHRASE } from "../content";
import { useChat } from "../use-chat";
import { Composer } from "./composer";
import { ConsentGate } from "./consent-gate";
import { GuidedFlow } from "./guided-flow";
import { MessageList } from "./message-list";
import { QuickMessages } from "./quick-messages";
import { AIUnavailableNotice, HumanSupportPanel, SafetyPanel, SimulatedBadgeNotice } from "./support-panels";

export function ChatScreen() {
  const chat = useChat();
  const { state } = chat;
  const reducedMotion = useReducedMotion();
  const [panel, setPanel] = useState<"quick" | "guided" | null>("quick");

  if (state.phase === "checking") {
    return <p className="p-8 text-center text-foreground-muted" role="status">Carregando…</p>;
  }

  if (state.phase === "unavailable") {
    return (
      <div className="mx-auto max-w-xl p-4">
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

  if (state.phase === "consent" || state.phase === "starting" || state.phase === "start_failed") {
    return (
      <div className="px-4 py-8">
        <ConsentGate onAccept={chat.begin} busy={state.phase === "starting"} failed={state.phase === "start_failed"} />
      </div>
    );
  }

  const isClosed = state.status === "closed" || state.status === "archived";
  const humanActive = state.status === "human_active";
  const canAskHuman = state.status === "ai_active";

  function sendQuick(item: QuickMessage) {
    if (item.message === HUMAN_REQUEST_PHRASE && canAskHuman) void chat.requestHuman();
    void chat.send(item.message, "quick");
  }

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] flex-col md:h-[calc(100dvh-4.25rem)]">
      {/* Cabeçalho do chat: sempre deixa claro se é IA ou pessoa. */}
      <div className="border-b border-border bg-surface px-3 py-2 sm:px-5">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <span
            className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full ${humanActive ? "bg-lavender-soft" : "bg-primary-soft"}`}
            aria-hidden
          >
            {humanActive ? <UserRound className="size-5" /> : <Bot className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold">
              {humanActive ? (state.assignedLabel ?? "Profissional da equipe") : "Assistente virtual (IA)"}
            </h1>
            <p className="truncate text-sm text-foreground-muted">
              {humanActive
                ? "Você está falando com uma pessoa"
                : isClosed
                  ? "Conversa encerrada"
                  : "Inteligência artificial — não é uma pessoa"}
            </p>
          </div>
          <Link
            href="/ajuda"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-lavender-soft px-3 text-sm font-semibold"
          >
            <LifeBuoy className="size-4" aria-hidden /> Ajuda
          </Link>
          <ChatMenu onClose={chat.closeConversation} disabled={isClosed} />
        </div>
      </div>

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
      />

      {/* Anúncios para leitores de tela: apenas mensagens recebidas. */}
      <p className="sr-only" aria-live="polite">
        {state.announcement}
      </p>

      <AIUnavailableNotice state={state} onRetry={chat.retryAI} onRequestHuman={chat.requestHuman} />
      {state.notice && (
        <p role="alert" className="mx-auto mb-2 max-w-2xl px-3 text-sm font-medium text-danger">
          {state.notice}
        </p>
      )}

      {isClosed ? (
        <Card className="mx-3 mb-3 p-5 sm:mx-auto sm:w-full sm:max-w-2xl">
          <p className="font-semibold">Esta conversa foi encerrada.</p>
          <p className="mt-1 text-foreground-muted">Você pode começar outra quando quiser.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={chat.startNew}>Começar nova conversa</Button>
            <Link href="/conta" className="inline-flex min-h-12 items-center px-3 font-semibold underline underline-offset-4">
              Histórico e privacidade
            </Link>
          </div>
        </Card>
      ) : (
        <>
          {panel === "quick" && <QuickMessages onSelect={sendQuick} disabled={false} />}
          {panel === "guided" && (
            <GuidedFlow
              onSend={(text) => void chat.send(text, "guided")}
              onRequestHuman={() => canAskHuman && void chat.requestHuman()}
              onClose={() => setPanel(null)}
            />
          )}
          <div className="border-t border-border bg-surface px-3 pt-2 pb-3 sm:px-5">
            <div className="mx-auto mb-2 flex max-w-2xl gap-2 overflow-x-auto">
              <ToggleChip active={panel === "quick"} onClick={() => setPanel(panel === "quick" ? null : "quick")}>
                <MessageSquareText className="size-4" aria-hidden /> Mensagens prontas
              </ToggleChip>
              <ToggleChip active={panel === "guided"} onClick={() => setPanel(panel === "guided" ? null : "guided")}>
                Não consigo escrever
              </ToggleChip>
              {canAskHuman && (
                <button
                  type="button"
                  onClick={() => void chat.requestHuman()}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-lavender-soft px-4 text-sm font-semibold"
                >
                  <HandHeart className="size-4" aria-hidden /> Quero falar com uma pessoa
                </button>
              )}
            </div>
            <Composer
              onSend={(text) => void chat.send(text)}
              disabled={false}
              placeholder={humanActive ? "Escreva para o profissional…" : "Escreva no seu ritmo…"}
            />
          </div>
        </>
      )}
    </div>
  );
}

function ToggleChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-semibold aria-pressed:border-primary aria-pressed:bg-primary-soft"
    >
      {children}
    </button>
  );
}

function ChatMenu({ onClose, disabled }: { onClose: () => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Mais opções da conversa">
          <MoreVertical aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Opções da conversa</DialogTitle>
        <DialogDescription>Nada acontece sem a sua confirmação.</DialogDescription>
        <div className="mt-5 flex flex-col gap-3">
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() => {
              onClose();
              setOpen(false);
            }}
          >
            Encerrar esta conversa
          </Button>
          <Link
            href="/conta"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border font-semibold hover:bg-surface-muted"
          >
            Apagar histórico e privacidade
          </Link>
          <Link
            href="/configuracoes"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border font-semibold hover:bg-surface-muted"
          >
            Preferências de comunicação
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
