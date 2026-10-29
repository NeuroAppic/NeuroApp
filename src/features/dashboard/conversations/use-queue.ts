"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { QueueConversation } from "@/types/domain";

const COLUMNS =
  "id, user_id, status, state_version, priority, risk_level, assigned_staff_id, assigned_label, created_at, closed_at, last_message_at";

/**
 * Fila de atendimentos com atualização em tempo real (canal privado
 * `staff:queue`, que só transporta metadados). Ao reconectar, a lista é
 * recarregada do banco — sem polling periódico.
 */
export function useQueue(range: "active" | "recent") {
  const [items, setItems] = useState<QueueConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [priorityAlert, setPriorityAlert] = useState<string>("");

  const load = useCallback(async () => {
    const supabase = getBrowserSupabase();
    let query = supabase.from("conversations").select(COLUMNS).order("last_message_at", { ascending: false }).limit(200);
    query =
      range === "active"
        ? query.in("status", ["ai_active", "waiting_human", "human_active"])
        : query.gte("last_message_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
    const { data } = await query;
    setItems((data ?? []) as QueueConversation[]);
    setLoading(false);
  }, [range]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial a partir do banco
    void load();
  }, [load]);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    let disposed = false;
    let wasLive = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      await supabase.realtime.setAuth();
      if (disposed) return;
      channel = supabase
        .channel("staff:queue", { config: { private: true } })
        .on("broadcast", { event: "queue_changed" }, ({ payload }) => {
          const p = payload as Partial<QueueConversation> & { id: string; deleted?: boolean };
          setItems((current) => {
            if (p.deleted) return current.filter((c) => c.id !== p.id);
            const existing = current.find((c) => c.id === p.id);
            if (!existing && p.priority && p.status !== "human_active") {
              setPriorityAlert(`Nova conversa prioritária às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`);
            }
            const merged = { ...(existing ?? ({} as QueueConversation)), ...p } as QueueConversation;
            return [merged, ...current.filter((c) => c.id !== p.id)];
          });
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setLive(true);
            if (wasLive) void load();
            wasLive = true;
          } else {
            setLive(false);
          }
        });
    })();
    return () => {
      disposed = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [load]);

  return { items, loading, live, reload: load, priorityAlert };
}
