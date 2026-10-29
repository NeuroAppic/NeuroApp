"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui/field";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { StaffAvailability } from "@/types/domain";

const OPTIONS: { value: StaffAvailability; label: string }[] = [
  { value: "available", label: "Disponível para atender" },
  { value: "busy", label: "Ocupado(a)" },
  { value: "away", label: "Ausente" },
  { value: "offline", label: "Offline" },
];

/**
 * Disponibilidade do profissional. Um sinal de presença a cada 60 s mantém o
 * status "disponível" verdadeiro: sem sinal por 3 min, o portal deixa de
 * contar esta pessoa como disponível.
 */
export function AvailabilityControl({ className }: { className?: string }) {
  const [value, setValue] = useState<StaffAvailability | null>(null);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    let cancelled = false;
    const beat = async (availability?: StaffAvailability) => {
      const { data } = await supabase.rpc("staff_heartbeat", availability ? { p_availability: availability } : {});
      if (!cancelled && data) setValue(data as StaffAvailability);
    };
    void beat();
    const timer = window.setInterval(() => void beat(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  async function change(next: StaffAvailability) {
    setValue(next);
    await getBrowserSupabase().rpc("staff_heartbeat", { p_availability: next });
  }

  return (
    <div className={className}>
      <label htmlFor="disponibilidade" className="text-sm font-semibold">
        Minha disponibilidade
      </label>
      <Select
        id="disponibilidade"
        value={value ?? ""}
        onChange={(e) => void change(e.target.value as StaffAvailability)}
        className="mt-1"
        disabled={value === null}
      >
        {value === null && <option value="">Carregando…</option>}
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
