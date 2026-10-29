import { AlertTriangle } from "lucide-react";
import { redirect } from "next/navigation";
import { Notice } from "@/components/ui/notice";
import { BarChart, formatNumber, type BarDatum } from "@/features/dashboard/bar-chart";
import { getStaffSession } from "@/lib/auth/dal";
import { getServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Visão geral" };

interface Metrics {
  generated_at: string;
  active_users: Record<"now" | "last_24h" | "last_7d" | "last_30d" | "last_30d_visitors" | "last_30d_registered", number>;
  conversations: Record<
    | "started_24h"
    | "started_7d"
    | "started_30d"
    | "in_progress"
    | "waiting_human"
    | "human_active"
    | "priority_open"
    | "closed_30d"
    | "human_sessions_closed_30d",
    number
  >;
  staff: Record<"available_clinicians" | "active_clinicians" | "pending_credentials", number>;
  ai: Record<"requests_24h" | "requests_7d" | "errors_24h" | "tokens_24h" | "tokens_30d", number>;
  usage_by_hour_7d: number[];
  conversations_by_day_14d: { day: string; count: number }[];
  pending_deletion_requests: number;
}

export default async function OverviewPage() {
  const session = await getStaffSession();
  if (!session?.isAdmin) redirect("/dashboard/atendimentos");

  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("dashboard_metrics");
  if (error || !data) {
    return (
      <Notice tone="danger" icon={<AlertTriangle aria-hidden />}>
        Não foi possível carregar as métricas agora.
      </Notice>
    );
  }
  const m = data as Metrics;

  const hourData: BarDatum[] = m.usage_by_hour_7d.map((value, hour) => ({
    key: String(hour),
    label: `${hour}h`,
    fullLabel: `${hour}h–${hour + 1}h`,
    value,
  }));
  const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const dayData: BarDatum[] = m.conversations_by_day_14d.map((d) => ({
    key: d.day,
    label: dayFormat.format(new Date(d.day)),
    fullLabel: new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" }).format(new Date(d.day)),
    value: d.count,
  }));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold">Visão geral</h1>
        <p className="text-foreground-muted">
          Dados agregados do banco, sem conteúdo de conversas. Atualizado em{" "}
          {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(m.generated_at))}.
        </p>
      </header>

      <Section title="Pessoas ativas" note="Pessoa ativa = enviou ao menos uma mensagem no período. Visitante = sessão anônima; registrada = conta com e-mail.">
        <Stat label="Agora (5 min)" value={m.active_users.now} />
        <Stat label="Últimas 24 h" value={m.active_users.last_24h} />
        <Stat label="Últimos 7 dias" value={m.active_users.last_7d} />
        <Stat label="Últimos 30 dias" value={m.active_users.last_30d} hint={`${formatNumber(m.active_users.last_30d_visitors)} visitantes · ${formatNumber(m.active_users.last_30d_registered)} registradas`} />
      </Section>

      <Section title="Conversas" note="Uma pessoa pode ter várias conversas. Conversas apagadas pela pessoa não entram na contagem.">
        <Stat label="Iniciadas (24 h)" value={m.conversations.started_24h} hint={`${formatNumber(m.conversations.started_30d)} em 30 dias`} />
        <Stat label="Em andamento" value={m.conversations.in_progress} />
        <Stat label="Aguardando pessoa" value={m.conversations.waiting_human} hint={m.conversations.priority_open > 0 ? `${m.conversations.priority_open} prioritárias` : undefined} />
        <Stat label="Com profissional agora" value={m.conversations.human_active} />
        <Stat label="Encerradas (30 dias)" value={m.conversations.closed_30d} hint={`${formatNumber(m.conversations.human_sessions_closed_30d)} atendimentos humanos concluídos`} />
      </Section>

      <Section title="Equipe e IA">
        <Stat label="Profissionais disponíveis" value={m.staff.available_clinicians} hint={`${m.staff.active_clinicians} habilitados no total`} />
        <Stat label="Credenciais pendentes" value={m.staff.pending_credentials} />
        <Stat label="Respostas da IA (24 h)" value={m.ai.requests_24h} hint={`${formatNumber(m.ai.errors_24h)} falhas · ${formatNumber(m.ai.requests_7d)} em 7 dias`} />
        <Stat label="Tokens de IA (30 dias)" value={m.ai.tokens_30d} hint={`${formatNumber(m.ai.tokens_24h)} nas últimas 24 h`} />
        <Stat label="Pedidos de exclusão pendentes" value={m.pending_deletion_requests} />
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <BarChart
          title="Mensagens por hora do dia"
          description="Mensagens enviadas pelas pessoas nos últimos 7 dias, por hora local."
          data={hourData}
          unit="mensagens"
          labelEvery={3}
        />
        <BarChart
          title="Conversas iniciadas por dia"
          description="Últimos 14 dias."
          data={dayData}
          unit="conversas"
          labelEvery={2}
        />
      </div>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      {note && <p className="text-sm text-foreground-muted">{note}</p>}
      <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">{children}</dl>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <dt className="text-sm text-foreground-muted">{label}</dt>
      <dd className="mt-1 text-3xl font-bold tabular-nums">{formatNumber(value)}</dd>
      {hint && <dd className="mt-1 text-xs text-foreground-muted">{hint}</dd>}
    </div>
  );
}
