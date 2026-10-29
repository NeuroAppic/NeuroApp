"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_EMERGENCY_CONTACTS } from "@/lib/safety/emergency";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { EmergencyContact, EmergencyContacts } from "@/types/domain";

type Retention = {
  conversation_days: number;
  professional_record_days: number;
  anonymous_inactive_days: number;
  ai_usage_days: number;
  auto_close_idle_hours: number;
  backup_window_days: number;
};
type Limits = {
  user_messages_per_minute: number;
  user_messages_per_day: number;
  global_requests_per_day: number;
};

const RETENTION_LABELS: Record<keyof Retention, string> = {
  conversation_days: "Conversas sem profissional (dias)",
  professional_record_days: "Conversas com profissional (dias)",
  anonymous_inactive_days: "Visitantes inativos (dias)",
  ai_usage_days: "Métricas de uso da IA (dias)",
  auto_close_idle_hours: "Encerrar conversa ociosa após (horas)",
  backup_window_days: "Janela de cópias de segurança (dias, informativo)",
};
const LIMIT_LABELS: Record<keyof Limits, string> = {
  user_messages_per_minute: "Mensagens por pessoa por minuto",
  user_messages_per_day: "Mensagens por pessoa por dia",
  global_requests_per_day: "Respostas da IA por dia (total)",
};

export function SettingsEditor({ initial, canEdit }: { initial: Record<string, unknown>; canEdit: boolean }) {
  const [contacts, setContacts] = useState<EmergencyContacts>(
    (initial["public.emergency_contacts"] as EmergencyContacts | undefined) ?? DEFAULT_EMERGENCY_CONTACTS,
  );
  const [retention, setRetention] = useState<Retention>(initial["retention"] as Retention);
  const [limits, setLimits] = useState<Limits>(initial["ai.limits"] as Limits);
  const [autoEscalate, setAutoEscalate] = useState<boolean>(
    Boolean((initial["safety.auto_escalate"] as { enabled?: boolean } | undefined)?.enabled ?? true),
  );
  const [status, setStatus] = useState<string | null>(null);

  async function save(key: string, value: unknown, label: string) {
    const { error } = await getBrowserSupabase().rpc("admin_update_setting", { p_key: key, p_value: value });
    setStatus(error ? `Não foi possível salvar: ${label}.` : `${label}: salvo.`);
  }

  function updateContact(i: number, patch: Partial<EmergencyContact>) {
    setContacts((c) => ({ ...c, contacts: c.contacts.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  }

  return (
    <div className="space-y-6">
      {status && <p role="status" className="rounded-xl bg-primary-soft p-3">{status}</p>}

      <Card className="p-5">
        <h2 className="text-lg font-semibold">Contatos de emergência</h2>
        <p className="text-sm text-foreground-muted">Exibidos no portal e no protocolo de crise. Ajuste ao país de operação.</p>
        <div className="mt-3 max-w-40">
          <Label htmlFor="pais">País (código)</Label>
          <Input id="pais" value={contacts.country} disabled={!canEdit} onChange={(e) => setContacts({ ...contacts, country: e.target.value.toUpperCase().slice(0, 2) })} />
        </div>
        <ul className="mt-4 space-y-4">
          {contacts.contacts.map((c, i) => (
            <li key={i} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-2">
              <Input aria-label="Nome do serviço" value={c.name} disabled={!canEdit} onChange={(e) => updateContact(i, { name: e.target.value })} />
              <Input aria-label="Telefone" value={c.phone} disabled={!canEdit} onChange={(e) => updateContact(i, { phone: e.target.value })} />
              <Input aria-label="Descrição" className="sm:col-span-2" value={c.description} disabled={!canEdit} onChange={(e) => updateContact(i, { description: e.target.value })} />
              <Input aria-label="Site (opcional)" placeholder="https://" value={c.url ?? ""} disabled={!canEdit} onChange={(e) => updateContact(i, { url: e.target.value || undefined })} />
              {canEdit && (
                <Button variant="ghost" size="sm" onClick={() => setContacts({ ...contacts, contacts: contacts.contacts.filter((_, j) => j !== i) })}>
                  <Trash2 aria-hidden /> Remover
                </Button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setContacts({ ...contacts, contacts: [...contacts.contacts, { id: crypto.randomUUID().slice(0, 8), name: "", phone: "", description: "" }] })}>
              <Plus aria-hidden /> Adicionar contato
            </Button>
            <Button size="sm" onClick={() => void save("public.emergency_contacts", { ...contacts, contacts: contacts.contacts.filter((c) => c.name && c.phone) }, "Contatos de emergência")}>
              Salvar contatos
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-semibold">Protocolo de segurança</h2>
        <div className="mt-3 flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold">Encaminhar risco alto para a fila prioritária</p>
            <p className="text-sm text-foreground-muted">Só acontece se houver profissional disponível. Revisar com a supervisão clínica.</p>
          </div>
          <Switch
            checked={autoEscalate}
            disabled={!canEdit}
            aria-label="Encaminhar risco alto para a fila prioritária"
            onCheckedChange={(v) => {
              setAutoEscalate(v);
              void save("safety.auto_escalate", { enabled: v }, "Protocolo de segurança");
            }}
          />
        </div>
      </Card>

      <NumberGroup title="Retenção de dados" labels={RETENTION_LABELS} values={retention} onChange={setRetention} canEdit={canEdit} onSave={() => save("retention", retention, "Retenção")} />
      <NumberGroup title="Limites de uso da IA" labels={LIMIT_LABELS} values={limits} onChange={setLimits} canEdit={canEdit} onSave={() => save("ai.limits", limits, "Limites da IA")} />
    </div>
  );
}

function NumberGroup<T extends Record<string, number>>({
  title,
  labels,
  values,
  onChange,
  canEdit,
  onSave,
}: {
  title: string;
  labels: Record<keyof T, string>;
  values: T;
  onChange: (v: T) => void;
  canEdit: boolean;
  onSave: () => void;
}) {
  if (!values) return null;
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {(Object.keys(labels) as (keyof T & string)[]).map((key) => (
          <div key={key}>
            <Label htmlFor={`n-${key}`}>{labels[key]}</Label>
            <Input
              id={`n-${key}`}
              type="number"
              min={0}
              value={values[key] ?? 0}
              disabled={!canEdit}
              onChange={(e) => onChange({ ...values, [key]: Math.max(0, Number(e.target.value)) })}
            />
          </div>
        ))}
      </div>
      {canEdit && <Button size="sm" className="mt-4" onClick={onSave}>Salvar</Button>}
    </Card>
  );
}
