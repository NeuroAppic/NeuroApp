"use client";

import { useSyncExternalStore } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { StaffAvailability } from "@/types/domain";

/**
 * Disponibilidade do profissional, compartilhada entre o menu lateral e a
 * central de atendimentos. Um sinal de presença a cada 60 s mantém o status
 * "disponível" verdadeiro: sem sinal por 3 min, o portal deixa de contar esta
 * pessoa como disponível (ver available_clinicians_count no banco).
 */
let current: StaffAvailability | null = null;
const listeners = new Set<() => void>();
let timer: number | null = null;

function emit(value: StaffAvailability | null) {
  current = value;
  for (const l of listeners) l();
}

async function beat(next?: StaffAvailability) {
  const { data } = await getBrowserSupabase().rpc("staff_heartbeat", next ? { p_availability: next } : {});
  if (data) emit(data as StaffAvailability);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void beat();
    timer = window.setInterval(() => void beat(), 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

export function useAvailability(): {
  availability: StaffAvailability | null;
  setAvailability: (next: StaffAvailability) => Promise<void>;
} {
  const availability = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  return {
    availability,
    setAvailability: async (next) => {
      emit(next);
      await beat(next);
    },
  };
}
