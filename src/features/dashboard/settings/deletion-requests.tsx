"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";

interface Request {
  id: string;
  scope: "conversation" | "account";
  conversation_id: string | null;
  pending_reason: string | null;
  requested_at: string;
}

const REASON: Record<string, string> = {
  professional_record_retention: "Registro de atendimento profissional dentro do prazo de guarda",
  legal_hold: "Bloqueio legal ativo",
};

/** Pedidos de exclusão que dependem de análise (retenção legal). Sem conteúdo. */
export function DeletionRequests({ requests }: { requests: Request[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function resolve(id: string, approve: boolean) {
    setError(null);
    const { error: rpcError } = await getBrowserSupabase().rpc("admin_resolve_deletion_request", { p_request_id: id, p_approve: approve });
    if (rpcError) setError(rpcError.message.includes("legal_hold_active") ? "Há bloqueio legal ativo: remova-o antes (equipe clínica)." : "Não foi possível concluir.");
    router.refresh();
  }

  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">Pedidos de exclusão pendentes</h2>
      <p className="text-sm text-foreground-muted">
        Pedidos que não puderam ser atendidos na hora por obrigação de guarda. A rotina de retenção conclui
        automaticamente ao fim do prazo; aprove antes apenas com orientação jurídica.
      </p>
      {error && <p role="alert" className="mt-3 rounded-xl bg-danger-soft p-3 text-sm font-medium text-danger">{error}</p>}
      {requests.length === 0 ? (
        <p className="mt-3 text-foreground-muted">Nenhum pedido pendente.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {requests.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold">{r.scope === "account" ? "Encerramento de conta" : "Exclusão de conversa"} · {formatDateTime(r.requested_at)}</p>
                <p className="text-sm text-foreground-muted">{REASON[r.pending_reason ?? ""] ?? r.pending_reason}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="danger" onClick={() => void resolve(r.id, true)}>Excluir agora</Button>
                <Button size="sm" variant="ghost" onClick={() => void resolve(r.id, false)}>Manter (recusar)</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
