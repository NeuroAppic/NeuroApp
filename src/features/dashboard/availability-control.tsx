"use client";

import { Select } from "@/components/ui/field";
import type { StaffAvailability } from "@/types/domain";
import { useAvailability } from "./use-availability";

export const AVAILABILITY_OPTIONS: { value: StaffAvailability; label: string }[] = [
  { value: "available", label: "Disponível para atender" },
  { value: "busy", label: "Ocupado(a)" },
  { value: "away", label: "Ausente" },
  { value: "offline", label: "Offline" },
];

export function AvailabilityControl({ className }: { className?: string }) {
  const { availability, setAvailability } = useAvailability();
  return (
    <div className={className}>
      <label htmlFor="disponibilidade" className="text-sm font-semibold">
        Minha disponibilidade
      </label>
      <Select
        id="disponibilidade"
        value={availability ?? ""}
        onChange={(e) => void setAvailability(e.target.value as StaffAvailability)}
        className="mt-1"
        disabled={availability === null}
      >
        {availability === null && <option value="">Carregando…</option>}
        {AVAILABILITY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
