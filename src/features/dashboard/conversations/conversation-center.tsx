"use client";

import { AlertTriangle, ArrowLeft, Bot, CircleDot, Lock, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { STATUS_LABEL } from "@/lib/conversation-labels";
import { cn, formatDateTime, formatRelative, formatTime } from "@/lib/utils";
import type { QueueConversation, RiskLevel } from "@/types/domain";
import { useAvailability } from "../use-availability";
import { useQueue } from "./use-queue";
import { useStaffConversation, type StaffConversationDetail } from "./use-staff-conversation";

const RISK_LABEL: Record<RiskLevel, string | null> = {
  none: null,
  attention: "Atenção",
  high: "Risco alto",
  critical: "Risco crítico",
};

type Filter = "queue" | "mine" | "active" | "recent";

export function ConversationCenter({
  staffId,
  isClinician,
  isAdmin,
}: {
  staffId: string;
  isClinician: boolean;
  isAdmin: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("queue");
  const { items, loading, live, priorityAlert } = useQueue(filter === "recent" ? "recent" : "active");
  const [selected, setSelected] = useState<string | null>(null);

  const visible = useMemo(() => {
    const list = items.filter((c) => {
      if (filter === "queue") return c.status === "waiting_human" || (c.priority && c.status === "ai_active");
      if (filter === "mine") return c.assigned_staff_id === staffId && c.status === "human_active";
      if (filter === "active") return ["ai_active", "waiting_human", "human_active"].includes(c.status);
      return true;
    });
    // Clínicos só veem na lista o que podem abrir (fila, prioritárias ou suas).
    const allowed = isAdmin
      ? list
      : list.filter((c) => c.status === "waiting_human" || c.priority || c.assigned_staff_id === staffId);
    return allowed.sort(
      (a, b) =>
        Number(b.priority) - Number(a.priority) ||
        (a.status === "waiting_human" ? -1 : 0) - (b.status === "waiting_human" ? -1 : 0) ||
        a.last_message_at.localeCompare(b.last_message_at),
    );
  }, [items, filter, staffId, isAdmin]);

  const selectedMeta = items.find((c) => c.id === selected) ?? null;

  // Quantas pessoas esperam por alguém: aparece no título da aba (aviso discreto, sem som).
  const waitingCount = items.filter((c) => c.status === "waiting_human").length;
  useEffect(() => {
    const base = "Atendimentos · Painel Acolher";
    document.title = waitingCount > 0 ? `(${waitingCount}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [waitingCount]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Atendimentos</h1>
          <p className="flex items-center gap-1.5 text-sm text-foreground-muted">
            <CircleDot className={cn("size-3.5", live ? "text-chart-1" : "text-foreground-muted")} aria-hidden />
            {live ? "Atualização em tempo real ativa" : "Reconectando ao tempo real…"}
          </p>
        </div>
        <p className="sr-only" aria-live="polite">
          {priorityAlert}
        </p>
        {priorityAlert && (
          <Badge tone="danger">
            <AlertTriangle aria-hidden /> {priorityAlert}
          </Badge>
        )}
      </header>

      {isClinician && <AvailabilityNotice waitingCount={waitingCount} />}

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr] 2xl:grid-cols-[20rem_1fr_18rem]">
        {/* Coluna esquerda: fila e filtros */}
        <section aria-label="Fila de atendimentos" className={cn("rounded-2xl border border-border bg-surface", selected && "hidden lg:block")}>
          <div className="border-b border-border p-3">
            <label htmlFor="filtro" className="sr-only">Filtrar conversas</label>
            <Select id="filtro" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
              <option value="queue">Fila (aguardando e prioritárias)</option>
              {isClinician && <option value="mine">Meus atendimentos</option>}
              <option value="active">Todas em andamento</option>
              <option value="recent">Últimos 7 dias (inclui encerradas)</option>
            </Select>
          </div>
          {loading ? (
            <p className="p-4 text-foreground-muted">Carregando…</p>
          ) : visible.length === 0 ? (
            <p className="p-4 text-foreground-muted">Nenhuma conversa neste filtro.</p>
          ) : (
            <ul className="max-h-[70dvh] divide-y divide-border overflow-y-auto">
              {visible.map((c) => (
                <li key={c.id}>
                  <QueueItem item={c} active={selected === c.id} mine={c.assigned_staff_id === staffId} onSelect={() => setSelected(c.id)} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Coluna central + direita */}
        {selected ? (
          <ConversationWorkspace
            key={selected}
            conversationId={selected}
            meta={selectedMeta}
            staffId={staffId}
            isClinician={isClinician}
            isAdmin={isAdmin}
            onBack={() => setSelected(null)}
          />
        ) : (
          <div className="hidden rounded-2xl border border-dashed border-border p-8 text-center text-foreground-muted lg:block">
            Selecione uma conversa na fila.
          </div>
        )}
      </div>
    </div>
  );
}

/** Lembra o profissional de ficar disponível: é isso que o portal mostra a quem pede ajuda. */
function AvailabilityNotice({ waitingCount }: { waitingCount: number }) {
  const { availability, setAvailability } = useAvailability();
  if (availability === null || availability === "available") return null;
  return (
    <Notice tone="sky" icon={<CircleDot aria-hidden />}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          Você não está como <strong>disponível</strong>. Para quem pede ajuda, o portal informa que não
          há profissionais disponíveis{waitingCount > 0 ? ` — e há ${waitingCount} pessoa(s) aguardando` : ""}.
        </p>
        <Button size="sm" onClick={() => void setAvailability("available")}>
          Ficar disponível
        </Button>
      </div>
    </Notice>
  );
}

function QueueItem({ item, active, mine, onSelect }: { item: QueueConversation; active: boolean; mine: boolean; onSelect: () => void }) {
  const risk = RISK_LABEL[item.risk_level];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className="flex w-full flex-col gap-1.5 p-3 text-left hover:bg-surface-muted aria-[current=true]:bg-primary-soft"
    >
      <span className="flex flex-wrap items-center gap-1.5">
        {item.priority && <Badge tone="danger">Prioritária</Badge>}
        <Badge tone={item.status === "waiting_human" ? "sky" : item.status === "human_active" ? "lavender" : "neutral"}>
          {STATUS_LABEL[item.status]}
        </Badge>
        {risk && !item.priority && <Badge tone="danger">{risk}</Badge>}
      </span>
      <span className="text-sm text-foreground-muted">
        Última mensagem {formatRelative(item.last_message_at)}
        {item.assigned_label && ` · ${mine ? "Você" : item.assigned_label}`}
      </span>
    </button>
  );
}

function ConversationWorkspace({
  conversationId,
  meta,
  staffId,
  isClinician,
  isAdmin,
  onBack,
}: {
  conversationId: string;
  meta: QueueConversation | null;
  staffId: string;
  isClinician: boolean;
  isAdmin: boolean;
  onBack: () => void;
}) {
  const conv = useStaffConversation(conversationId, isClinician);
  const detail = conv.detail;
  const status = detail?.conversation.status ?? meta?.status;
  const assignedToMe = (detail?.conversation.assigned_staff_id ?? meta?.assigned_staff_id) === staffId;
  const canClaim = isClinician && (status === "waiting_human" || (status === "ai_active" && (detail?.conversation.priority ?? meta?.priority)));
  const canWrite = isClinician && status === "human_active" && assignedToMe;

  return (
    <>
      <section aria-label="Conversa selecionada" className="flex min-h-[60dvh] flex-col rounded-2xl border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="lg:hidden">
            <ArrowLeft aria-hidden /> Fila
          </Button>
          {status && <Badge tone="sky">{STATUS_LABEL[status]}</Badge>}
          {(detail?.conversation.assigned_label ?? meta?.assigned_label) && (
            <span className="text-sm text-foreground-muted">
              Responsável: {assignedToMe ? "você" : (detail?.conversation.assigned_label ?? meta?.assigned_label)}
            </span>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            {canClaim && (
              <Button size="sm" onClick={() => void conv.claim()} disabled={conv.busy}>
                Assumir atendimento
              </Button>
            )}
            {canWrite && (
              <>
                <TransferControl onTransfer={(id) => void conv.transfer(id)} staffId={staffId} disabled={conv.busy} />
                <Button size="sm" variant="secondary" onClick={() => void conv.releaseToAI()} disabled={conv.busy}>
                  Devolver para a IA
                </Button>
                <Button size="sm" variant="danger" onClick={() => void conv.close()} disabled={conv.busy}>
                  Finalizar
                </Button>
              </>
            )}
            {!isClinician && isAdmin && status === "human_active" && (
              <TransferControl onTransfer={(id) => void conv.transfer(id)} staffId={staffId} disabled={conv.busy} />
            )}
          </div>
        </div>

        {conv.error && (
          <p role="alert" className="m-3 rounded-xl bg-danger-soft p-3 text-sm font-medium text-danger">
            {conv.error}
          </p>
        )}

        {!isClinician ? (
          <Notice tone="neutral" icon={<Lock aria-hidden />} className="m-4">
            <p className="font-semibold">Conteúdo restrito à equipe clínica.</p>
            <p className="mt-1 text-sm">
              Administradores gerenciam filas e equipe, mas não leem conversas. Você vê apenas o estado e os metadados.
            </p>
          </Notice>
        ) : !detail ? (
          <p className="p-4 text-foreground-muted">{conv.error ? "" : "Carregando conversa…"}</p>
        ) : (
          <StaffMessages detail={detail} />
        )}

        {canWrite && <StaffComposer onSend={conv.send} disabled={conv.busy} />}
        {isClinician && status === "human_active" && !assignedToMe && (
          <p className="border-t border-border p-3 text-sm text-foreground-muted">Outro profissional está respondendo esta conversa.</p>
        )}
      </section>

      <aside aria-label="Informações do atendimento" className="rounded-2xl border border-border bg-surface p-4 lg:col-start-2 2xl:col-start-3 2xl:row-start-1">
        <PersonInfo detail={detail} meta={meta} onLegalHold={isClinician ? conv.setLegalHold : undefined} />
      </aside>
    </>
  );
}

function StaffMessages({ detail }: { detail: StaffConversationDetail }) {
  return (
    <ol className="flex max-h-[60dvh] flex-1 flex-col gap-3 overflow-y-auto p-4" aria-label="Mensagens">
      {detail.messages.map((m) =>
        m.sender === "system" ? (
          <li key={m.id} className="mx-auto max-w-md rounded-xl bg-surface-muted px-3 py-1.5 text-center text-sm text-foreground-muted">
            {m.content} <span className="text-xs">· {formatTime(m.created_at)}</span>
          </li>
        ) : (
          <li key={m.id} className={cn("max-w-[80%]", m.sender === "user" ? "self-start" : "self-end")}>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-foreground-muted">
              {m.sender === "user" ? <UserRound className="size-3.5" aria-hidden /> : m.sender === "ai" ? <Bot className="size-3.5" aria-hidden /> : null}
              {m.sender === "user" ? "Pessoa" : m.sender === "ai" ? "IA" : (m.sender_label ?? "Profissional")}
              {m.input_source === "quick" && " · mensagem pronta"}
              {m.input_source === "guided" && " · respostas guiadas"}
              <span>· {formatTime(m.created_at)}</span>
            </p>
            <div
              className={cn(
                "rounded-2xl px-3 py-2 whitespace-pre-wrap",
                m.sender === "user" ? "bg-surface-muted" : m.sender === "ai" ? "border border-border" : "bg-lavender-soft",
                (m.risk_level === "high" || m.risk_level === "critical") && "ring-2 ring-danger/50",
              )}
            >
              {m.content}
            </div>
          </li>
        ),
      )}
    </ol>
  );
}

function StaffComposer({ onSend, disabled }: { onSend: (text: string) => Promise<boolean>; disabled: boolean }) {
  const [text, setText] = useState("");
  return (
    <form
      className="flex items-end gap-2 border-t border-border p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const value = text.trim();
        if (!value) return;
        if (await onSend(value)) setText("");
      }}
    >
      <label htmlFor="resposta" className="sr-only">Resposta</label>
      <Textarea
        id="resposta"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        maxLength={4000}
        rows={2}
        placeholder="Escreva com calma, frases curtas…"
      />
      <Button type="submit" disabled={disabled || !text.trim()}>Enviar</Button>
    </form>
  );
}

function TransferControl({ onTransfer, staffId, disabled }: { onTransfer: (id: string) => void; staffId: string; disabled: boolean }) {
  const [options, setOptions] = useState<{ user_id: string; display_name: string }[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    void (async () => {
      const supabase = getBrowserSupabase();
      const { data: roles } = await supabase.from("staff_roles").select("user_id").eq("role", "psychologist");
      const ids = (roles ?? []).map((r) => r.user_id as string).filter((id) => id !== staffId);
      if (ids.length === 0) return setOptions([]);
      const { data } = await supabase
        .from("staff_profiles")
        .select("user_id, display_name")
        .in("user_id", ids)
        .eq("is_active", true)
        .eq("credential_status", "verified");
      setOptions((data ?? []) as { user_id: string; display_name: string }[]);
    })();
  }, [open, staffId]);

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} disabled={disabled}>
        Transferir
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="transferir" className="sr-only">Transferir para</label>
      <Select id="transferir" defaultValue="" onChange={(e) => e.target.value && onTransfer(e.target.value)} className="min-h-11 text-sm">
        <option value="" disabled>Transferir para…</option>
        {options.map((o) => (
          <option key={o.user_id} value={o.user_id}>{o.display_name}</option>
        ))}
      </Select>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
    </div>
  );
}

function PersonInfo({
  detail,
  meta,
  onLegalHold,
}: {
  detail: StaffConversationDetail | null;
  meta: QueueConversation | null;
  onLegalHold?: (hold: boolean, reason: string) => Promise<boolean>;
}) {
  const risk = RISK_LABEL[detail?.conversation.risk_level ?? meta?.risk_level ?? "none"];
  return (
    <div className="space-y-4 text-sm">
      <div>
        <h2 className="font-semibold">Pessoa</h2>
        <p className="text-foreground-muted">
          {detail?.person.display_name ? `Apelido: ${detail.person.display_name}` : "Sem apelido informado (identificação mínima)."}
        </p>
        {detail?.person.since && <p className="text-foreground-muted">Usa o portal desde {formatDateTime(detail.person.since)}</p>}
      </div>
      {risk && (
        <div>
          <h2 className="font-semibold">Triagem automática</h2>
          <p className="text-foreground-muted">{risk}. Indicador de apoio, não diagnóstico.</p>
        </div>
      )}
      <div>
        <h2 className="font-semibold">Preferências de comunicação</h2>
        {detail?.preferences ? (
          <ul className="list-inside list-disc text-foreground-muted">
            {detail.preferences.short_answers && <li>Prefere respostas curtas</li>}
            {detail.preferences.literal_communication && <li>Prefere comunicação literal e objetiva</li>}
            {detail.preferences.low_stimulus && <li>Usa o modo de baixo estímulo</li>}
            {!detail.preferences.short_answers && !detail.preferences.literal_communication && !detail.preferences.low_stimulus && <li>Nenhuma preferência marcada</li>}
          </ul>
        ) : (
          <p className="text-foreground-muted">Não compartilhadas pela pessoa.</p>
        )}
      </div>
      {detail && detail.assignments.length > 0 && (
        <div>
          <h2 className="font-semibold">Histórico de responsáveis</h2>
          <ul className="text-foreground-muted">
            {detail.assignments.map((a) => (
              <li key={a.assigned_at}>
                {a.staff_label ?? "Profissional removido"} — {formatDateTime(a.assigned_at)}
                {a.released_at && ` até ${formatTime(a.released_at)}`}
              </li>
            ))}
          </ul>
        </div>
      )}
      {detail && onLegalHold && (
        <div>
          <h2 className="font-semibold">Retenção</h2>
          <p className="text-foreground-muted">
            {detail.conversation.legal_hold ? "Bloqueio de exclusão ativo (registro obrigatório)." : "Segue a política de retenção padrão."}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="mt-1 -ml-3"
            onClick={() => void onLegalHold(!detail.conversation.legal_hold, "Registro profissional obrigatório")}
          >
            {detail.conversation.legal_hold ? "Remover bloqueio" : "Marcar como registro obrigatório"}
          </Button>
        </div>
      )}
    </div>
  );
}
