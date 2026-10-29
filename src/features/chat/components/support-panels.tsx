"use client";

import { CloudOff, HeartHandshake, Info, LifeBuoy, RotateCcw, UserRound } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { SAFETY_COPY } from "@/lib/safety/emergency";
import { EmergencyContactList, useEmergencyContacts } from "@/features/safety/emergency-contacts";
import type { ChatState } from "../chat-state";

/** Recursos de ajuda quando há sinais de risco. Sem alarmes, sem pop-up. */
export function SafetyPanel({ state, onHide }: { state: ChatState; onHide: () => void }) {
  const contacts = useEmergencyContacts();
  if (!state.safety.visible) return null;
  return (
    <section
      aria-labelledby="titulo-seguranca"
      className="animate-gentle-in border-b border-border bg-lavender-soft px-3 py-4 sm:px-5"
    >
      <div className="mx-auto max-w-2xl">
        <h2 id="titulo-seguranca" className="flex items-center gap-2 text-lg font-semibold">
          <LifeBuoy className="size-5" aria-hidden />
          {SAFETY_COPY.elevatedTitle}
        </h2>
        <p className="mt-1">{SAFETY_COPY.elevatedBody}</p>
        <EmergencyContactList contacts={contacts} compact className="mt-3 sm:grid-cols-2" />
        {state.safety.escalated && <p className="mt-3 text-sm">{SAFETY_COPY.escalatedNote}</p>}
        {state.availableProfessionals === 0 && <p className="mt-3 text-sm">{SAFETY_COPY.noStaffNote}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link href="/ajuda" className="inline-flex min-h-11 items-center px-1 font-semibold underline underline-offset-4">
            Ver todos os contatos
          </Link>
          <Button variant="ghost" size="sm" onClick={onHide}>
            Ocultar este aviso
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Estado do pedido de atendimento humano — sem fila fictícia e sem tempo inventado. */
export function HumanSupportPanel({
  state,
  onCancel,
}: {
  state: ChatState;
  onCancel: () => void;
}) {
  if (state.status === "human_active") {
    return (
      <Notice tone="lavender" icon={<UserRound aria-hidden />} className="rounded-none border-b border-border px-4 sm:px-5" role="status">
        <p className="mx-auto max-w-2xl font-semibold">
          Você está conversando com uma pessoa: {state.assignedLabel ?? "profissional da equipe"}.
        </p>
      </Notice>
    );
  }
  if (state.status !== "waiting_human") return null;

  const available = state.availableProfessionals;
  return (
    <Notice tone="sky" icon={<HeartHandshake aria-hidden />} className="rounded-none border-b border-border px-4 sm:px-5" role="status">
      <div className="mx-auto max-w-2xl">
        {available === null ? (
          <p>Seu pedido para falar com uma pessoa foi registrado.</p>
        ) : available > 0 ? (
          <p>
            Seu pedido está na fila. Quando um profissional assumir, você verá um aviso aqui. Não é
            possível prever quanto tempo vai levar. Enquanto isso, o assistente virtual continua
            disponível.
          </p>
        ) : (
          <p>
            Neste momento <strong>não há profissionais disponíveis</strong>. Seu pedido fica
            registrado, mas não sabemos quando alguém estará disponível. Você pode continuar com o
            assistente virtual, ouvir <Link href="/sons" className="font-semibold underline underline-offset-4">sons</Link>{" "}
            ou ligar para o CVV (188), que atende 24 horas.
          </p>
        )}
        <Button variant="ghost" size="sm" className="mt-2 -ml-2" onClick={onCancel}>
          Cancelar pedido
        </Button>
      </div>
    </Notice>
  );
}

/** IA indisponível: a mensagem foi guardada; nada é perdido em silêncio. */
export function AIUnavailableNotice({
  state,
  onRetry,
  onRequestHuman,
}: {
  state: ChatState;
  onRetry: () => void;
  onRequestHuman: () => void;
}) {
  if (!state.aiUnavailable) return null;
  return (
    <div className="mx-auto mb-2 max-w-2xl px-3 sm:px-0">
      <Notice tone="neutral" icon={<CloudOff aria-hidden />} role="alert">
        <p className="font-semibold">O assistente não conseguiu responder agora.</p>
        <p className="mt-1 whitespace-pre-line">{state.aiUnavailable.fallbackText}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {state.aiUnavailable.retryable && (
            <Button size="sm" variant="secondary" onClick={onRetry}>
              <RotateCcw aria-hidden /> Tentar de novo
            </Button>
          )}
          {state.status === "ai_active" && (
            <Button size="sm" variant="lavender" onClick={onRequestHuman}>
              Quero falar com uma pessoa
            </Button>
          )}
          <Link href="/ajuda" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold underline underline-offset-4">
            Contatos de ajuda
          </Link>
        </div>
      </Notice>
    </div>
  );
}

export function SimulatedBadgeNotice() {
  return (
    <p className="flex items-center justify-center gap-1.5 bg-surface-muted px-3 py-1.5 text-center text-xs font-semibold text-foreground-muted">
      <Info className="size-3.5" aria-hidden />
      Modo demonstração: as respostas são simuladas, não vêm de uma IA real.
    </p>
  );
}
