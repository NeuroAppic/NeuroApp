"use client";

import { Droplets, Eye, Sprout } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocalState } from "./use-local-state";

const FLOWERS = [
  { id: "lavanda", label: "Lavanda", color: "#b8a9d9" },
  { id: "pessego", label: "Pêssego", color: "#e2b6a3" },
  { id: "girassol", label: "Girassol", color: "#e8d49c" },
  { id: "celeste", label: "Celeste", color: "#8fa4b8" },
] as const;
type FlowerId = (typeof FLOWERS)[number]["id"];

export interface Plot {
  flower: FlowerId | null;
  growth: number; // 0 semente · 1 broto · 2 botão · 3 flor
}

const PLOT_COUNT = 12;
const STAGE_LABEL = ["semente", "broto", "botão", "flor aberta"];
const emptyGarden = (): Plot[] => Array.from({ length: PLOT_COUNT }, () => ({ flower: null, growth: 0 }));

export function validateGarden(raw: unknown): Plot[] | null {
  if (!Array.isArray(raw) || raw.length !== PLOT_COUNT) return null;
  const ok = raw.every(
    (p) =>
      p &&
      typeof p === "object" &&
      (p.flower === null || FLOWERS.some((f) => f.id === p.flower)) &&
      Number.isInteger(p.growth) &&
      p.growth >= 0 &&
      p.growth <= 3,
  );
  return ok ? (raw as Plot[]) : null;
}

/** Regras puras do jardim: não há como "perder" nem plantas que morrem. */
export function applyTool(plot: Plot, tool: "plant" | "water" | "look", flower: FlowerId): Plot {
  if (tool === "plant" && plot.flower === null) return { flower, growth: 0 };
  if (tool === "water" && plot.flower !== null) return { ...plot, growth: Math.min(3, plot.growth + 1) };
  return plot;
}

export function Garden() {
  const [plots, setPlots] = useLocalState<Plot[]>("acolher:jardim:v1", emptyGarden(), validateGarden);
  const [tool, setTool] = useState<"plant" | "water" | "look">("plant");
  const [flower, setFlower] = useState<FlowerId>("lavanda");
  const [message, setMessage] = useState("");

  function use(index: number) {
    const before = plots[index]!;
    const after = applyTool(before, tool, flower);
    if (after !== before) {
      setPlots(plots.map((p, i) => (i === index ? after : p)));
      setMessage(
        tool === "plant"
          ? `Você plantou ${FLOWERS.find((f) => f.id === flower)!.label} no canteiro ${index + 1}.`
          : `Canteiro ${index + 1}: agora é ${STAGE_LABEL[after.growth]}.`,
      );
    } else {
      setMessage(describe(before, index));
    }
  }

  return (
    <div className="space-y-5">
      <div role="radiogroup" aria-label="Ferramenta" className="flex flex-wrap gap-2">
        <ToolButton active={tool === "plant"} onClick={() => setTool("plant")} icon={<Sprout aria-hidden />}>Plantar</ToolButton>
        <ToolButton active={tool === "water"} onClick={() => setTool("water")} icon={<Droplets aria-hidden />}>Regar</ToolButton>
        <ToolButton active={tool === "look"} onClick={() => setTool("look")} icon={<Eye aria-hidden />}>Observar</ToolButton>
      </div>

      {tool === "plant" && (
        <div role="radiogroup" aria-label="Flor para plantar" className="flex flex-wrap gap-2">
          {FLOWERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={flower === f.id}
              onClick={() => setFlower(f.id)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold aria-checked:border-primary aria-checked:bg-primary-soft"
            >
              <span className="size-4 rounded-full" style={{ background: f.color }} aria-hidden />
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[#c9b79c]/30 p-2 sm:grid-cols-4 sm:gap-3 sm:p-3">
        {plots.map((plot, i) => (
          <button
            key={i}
            type="button"
            onClick={() => use(i)}
            aria-label={describe(plot, i)}
            className="flex aspect-square items-end justify-center rounded-xl bg-[#a98e6f]/25 hover:bg-[#a98e6f]/35"
          >
            <PlantSvg plot={plot} />
          </button>
        ))}
      </div>

      <p aria-live="polite" className="min-h-6 text-foreground-muted">{message}</p>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setPlots(emptyGarden());
          setMessage("O jardim está vazio de novo, pronto para recomeçar.");
        }}
      >
        Recomeçar jardim
      </Button>
    </div>
  );
}

function describe(plot: Plot, index: number): string {
  if (!plot.flower) return `Canteiro ${index + 1}: vazio`;
  const name = FLOWERS.find((f) => f.id === plot.flower)!.label;
  return `Canteiro ${index + 1}: ${name}, ${STAGE_LABEL[plot.growth]}`;
}

function ToolButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-4 font-semibold aria-checked:border-primary aria-checked:bg-primary-soft [&_svg]:size-5"
    >
      {icon}
      {children}
    </button>
  );
}

function PlantSvg({ plot }: { plot: Plot }) {
  const color = FLOWERS.find((f) => f.id === plot.flower)?.color ?? "#000";
  return (
    <svg viewBox="0 0 60 60" className="h-4/5 w-4/5" aria-hidden>
      <ellipse cx="30" cy="54" rx="18" ry="4" fill="#8a6f52" opacity="0.35" />
      {plot.flower && plot.growth === 0 && <ellipse cx="30" cy="50" rx="4.5" ry="3.5" fill="#c49a6c" />}
      {plot.flower && plot.growth >= 1 && (
        <g className={cn("origin-bottom", "motion-safe:animate-gentle-in")}>
          <path d={`M30 54 L30 ${plot.growth >= 2 ? 26 : 40}`} stroke="#6f8f72" strokeWidth="3" strokeLinecap="round" />
          <path d="M30 46 C22 42 20 38 22 36 C27 38 29 42 30 46" fill="#8fae90" />
          <path d="M30 44 C38 40 40 36 38 34 C33 36 31 40 30 44" fill="#8fae90" />
        </g>
      )}
      {plot.flower && plot.growth === 2 && <ellipse cx="30" cy="23" rx="5" ry="7" fill={color} />}
      {plot.flower && plot.growth === 3 && (
        <g>
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <ellipse key={deg} cx="30" cy="14" rx="5.5" ry="9" fill={color} transform={`rotate(${deg} 30 23)`} />
          ))}
          <circle cx="30" cy="23" r="5" fill="#f2e3b3" />
        </g>
      )}
    </svg>
  );
}
