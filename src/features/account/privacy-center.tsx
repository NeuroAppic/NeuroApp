"use client";

import type { User } from "@supabase/supabase-js";
import { Download, Eye, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/field";
import { STATUS_LABEL } from "@/lib/conversation-labels";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";
import type { ConversationStatus } from "@/types/domain";
import { UpgradeAccountForm } from "./upgrade-account-form";

interface OwnConversation {
  id: string;
  status: ConversationStatus;
  created_at: string;
  last_message_at: string;
}
interface DeletionRequest {
  id: string;
  status: string;
  pending_reason: string | null;
  requested_at: string;
}

const PENDING_REASON: Record<string, string> = {
  professional_record_retention:
    "Houve atendimento por profissional. A lei exige guardar o registro por um prazo; ele será apagado automaticamente ao final.",
  legal_hold: "Há uma obrigação legal de guarda em andamento. A exclusão acontece quando ela terminar.",
};

export function PrivacyCenter() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [nickname, setNickname] = useState("");
  const [conversations, setConversations] = useState<OwnConversation[]>([]);
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getBrowserSupabase();
    const { data } = await supabase.auth.getUser();
    setUser(data.user ?? null);
    if (!data.user) return;
    const [profile, convs, reqs] = await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", data.user.id).maybeSingle(),
      supabase.from("conversations").select("id, status, created_at, last_message_at").eq("user_id", data.user.id).order("created_at", { ascending: false }),
      supabase.from("deletion_requests").select("id, status, pending_reason, requested_at").eq("status", "pending").order("requested_at", { ascending: false }),
    ]);
    setNickname((profile.data?.display_name as string | null) ?? "");
    setConversations((convs.data ?? []) as OwnConversation[]);
    setRequests((reqs.data ?? []) as DeletionRequest[]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    void load();
  }, [load]);

  async function saveNickname() {
    if (!user) return;
    const value = nickname.trim().slice(0, 40);
    const { error } = await getBrowserSupabase().from("profiles").update({ display_name: value || null }).eq("id", user.id);
    setMessage(error ? "Não foi possível salvar o apelido." : "Apelido salvo.");
  }

  async function deleteConversation(id: string) {
    const { data, error } = await getBrowserSupabase().rpc("delete_my_conversation", { p_conversation_id: id });
    if (error) {
      setMessage("Não foi possível apagar agora. Tente novamente.");
      return;
    }
    const result = data as { result: "deleted" | "pending"; reason?: string };
    setMessage(
      result.result === "deleted"
        ? "Conversa apagada do banco de dados. Cópias de segurança são substituídas automaticamente em até 30 dias."
        : `Pedido de exclusão registrado. ${PENDING_REASON[result.reason ?? ""] ?? ""}`,
    );
    await load();
  }

  async function exportData() {
    const { data, error } = await getBrowserSupabase().rpc("export_my_data");
    if (error) {
      setMessage("Não foi possível gerar o arquivo agora.");
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "meus-dados-acolher.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (user === undefined) return <p className="mt-6 text-foreground-muted" role="status">Carregando…</p>;

  return (
    <div className="mt-8 space-y-6">
      {message && <p role="status" className="rounded-xl bg-primary-soft p-4">{message}</p>}

      <Card className="p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold"><Eye className="size-5" aria-hidden /> Quem pode ver suas mensagens</h2>
        <ul className="mt-3 list-inside list-disc space-y-1 text-foreground-muted">
          <li>Você.</li>
          <li>Psicólogos da plataforma com registro validado, quando você pede atendimento humano, quando a conversa é marcada como prioritária por segurança, ou quando eles já atenderam você.</li>
          <li>Administradores <strong>não</strong> leem conversas: veem apenas dados de funcionamento (horários, estado da conversa).</li>
          <li>O provedor de inteligência artificial recebe o trecho recente da conversa para gerar a resposta. Veja a <Link href="/privacidade" className="font-semibold underline underline-offset-4">política de privacidade</Link>.</li>
        </ul>
        <p className="mt-3 text-sm text-foreground-muted">Cada acesso de profissional ao conteúdo fica registrado em auditoria.</p>
      </Card>

      {!user ? (
        <Card className="p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Você ainda não iniciou uma conversa</h2>
          <p className="mt-1 text-foreground-muted">Nenhum dado seu está guardado. Se você já tem conta, pode entrar.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild><Link href="/conversar">Ir para a conversa</Link></Button>
            <Button asChild variant="secondary"><Link href="/entrar">Já tenho conta</Link></Button>
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck className="size-5" aria-hidden /> Sua sessão</h2>
            {user.is_anonymous ? (
              <>
                <p className="mt-1 text-foreground-muted">
                  Você está como <strong>visitante</strong>: suas conversas ficam ligadas a este navegador. Se quiser
                  acessá-las de outro aparelho, crie uma conta (opcional).
                </p>
                <UpgradeAccountForm onDone={load} />
              </>
            ) : (
              <p className="mt-1 text-foreground-muted">Conta: {user.email}</p>
            )}
            <div className="mt-5">
              <Label htmlFor="apelido">Como você gostaria de ser chamado(a)? (opcional)</Label>
              <div className="mt-1 flex gap-2">
                <Input id="apelido" value={nickname} maxLength={40} onChange={(e) => setNickname(e.target.value)} />
                <Button variant="secondary" onClick={saveNickname}>Salvar</Button>
              </div>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="text-xl font-semibold">Suas conversas</h2>
            {conversations.length === 0 ? (
              <p className="mt-2 text-foreground-muted">Nenhuma conversa guardada.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {conversations.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-semibold">Iniciada em {formatDateTime(c.created_at)}</p>
                      <Badge tone="neutral" className="mt-1">{STATUS_LABEL[c.status]}</Badge>
                    </div>
                    <ConfirmDelete onConfirm={() => deleteConversation(c.id)} />
                  </li>
                ))}
              </ul>
            )}
            {requests.length > 0 && (
              <div className="mt-4 rounded-xl bg-surface-muted p-4">
                <h3 className="font-semibold">Pedidos de exclusão em andamento</h3>
                <ul className="mt-1 space-y-1 text-sm text-foreground-muted">
                  {requests.map((r) => (
                    <li key={r.id}>{formatDateTime(r.requested_at)} — {PENDING_REASON[r.pending_reason ?? ""] ?? "Em análise."}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="text-xl font-semibold">Seus dados</h2>
            <p className="mt-1 text-foreground-muted">Baixe uma cópia de tudo o que está guardado sobre você.</p>
            <Button variant="secondary" className="mt-3" onClick={exportData}>
              <Download aria-hidden /> Baixar meus dados (JSON)
            </Button>
          </Card>

          <Card className="border-danger/30 p-5 sm:p-6">
            <h2 className="text-xl font-semibold">Encerrar conta e apagar dados</h2>
            <p className="mt-1 text-foreground-muted">
              Apaga suas conversas, preferências e a sua sessão. Conversas com registro profissional obrigatório
              ficam desvinculadas de você até o fim do prazo legal e depois são apagadas.
            </p>
            <DeleteAccountDialog />
          </Card>
        </>
      )}
    </div>
  );
}

function ConfirmDelete({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm"><Trash2 aria-hidden /> Apagar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Apagar esta conversa?</DialogTitle>
        <DialogDescription>
          As mensagens são removidas do banco de dados. Se houve atendimento profissional, pode existir um prazo
          legal de guarda — nesse caso, você verá o aviso.
        </DialogDescription>
        <div className="mt-5 flex gap-2">
          <Button variant="danger" onClick={async () => { await onConfirm(); setOpen(false); }}>Sim, apagar</Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>Manter</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAccountDialog() {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  async function run() {
    setState("busy");
    const response = await fetch("/api/me/delete-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm }),
    });
    setState(response.ok ? "done" : "error");
    if (response.ok) window.setTimeout(() => { router.replace("/"); router.refresh(); }, 2500);
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="danger" className="mt-3">Encerrar conta</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Encerrar conta e apagar dados</DialogTitle>
        <DialogDescription>Para confirmar, digite EXCLUIR. Esta ação não pode ser desfeita.</DialogDescription>
        {state === "done" ? (
          <p role="status" className="mt-4 rounded-xl bg-primary-soft p-3">Pronto. Seus dados foram apagados. Cópias de segurança expiram em até 30 dias.</p>
        ) : (
          <>
            <Label htmlFor="confirmar-exclusao" className="mt-4">Confirmação</Label>
            <Input id="confirmar-exclusao" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
            {state === "error" && <p role="alert" className="mt-2 text-sm font-medium text-danger">Não foi possível concluir. Tente de novo.</p>}
            <Button variant="danger" className="mt-4 w-full" disabled={confirm !== "EXCLUIR" || state === "busy"} onClick={run}>
              {state === "busy" ? "Apagando…" : "Apagar tudo"}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
