"use client";

import { useId, useState } from "react";

export interface BarDatum {
  key: string;
  /** Rótulo curto do eixo (ex.: "14h"). */
  label: string;
  /** Rótulo completo para tooltip/tabela (ex.: "14h–15h"). */
  fullLabel: string;
  value: number;
}

/**
 * Gráfico de barras de série única: barras finas com ponta arredondada de 4px
 * apoiadas na base, 2px de espaço entre barras, grade discreta, tooltip por
 * barra (hover e foco) e tabela equivalente para leitores de tela.
 */
export function BarChart({
  title,
  description,
  data,
  unit,
  labelEvery = 1,
}: {
  title: string;
  description: string;
  data: BarDatum[];
  unit: string;
  labelEvery?: number;
}) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const niceMax = niceCeil(max);
  const ticks = [0, niceMax / 2, niceMax];
  const activeDatum = active === null ? null : data[active];

  return (
    <figure aria-labelledby={`${id}-t`} className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
      <figcaption>
        <h3 id={`${id}-t`} className="font-semibold">
          {title}
        </h3>
        <p className="text-sm text-foreground-muted">{description}</p>
      </figcaption>

      <div className="relative mt-4 pl-8" aria-hidden>
        {/* Grade e eixo: recessivos. */}
        <div className="absolute inset-y-0 left-0 w-8">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-2 -translate-y-1/2 text-xs text-foreground-muted tabular-nums"
              style={{ bottom: `${(t / niceMax) * 100}%` }}
            >
              {formatNumber(t)}
            </span>
          ))}
        </div>
        <div className="relative h-44">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-border/60" style={{ bottom: `${(t / niceMax) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {data.map((d, i) => (
              <div
                key={d.key}
                className="group relative flex h-full flex-1 items-end"
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
              >
                <div
                  className="w-full rounded-t-[4px] bg-chart-1 transition-opacity group-hover:opacity-80"
                  style={{ height: `${(d.value / niceMax) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }}
                />
              </div>
            ))}
          </div>
          {activeDatum && (
            <div
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm whitespace-nowrap shadow-soft"
              style={{ left: `${((active! + 0.5) / data.length) * 100}%` }}
            >
              <strong className="tabular-nums">{formatNumber(activeDatum.value)}</strong> {unit}
              <span className="block text-xs text-foreground-muted">{activeDatum.fullLabel}</span>
            </div>
          )}
        </div>
        <div className="mt-1 flex gap-[2px]">
          {data.map((d, i) => (
            <span key={d.key} className="flex-1 text-center text-[0.7rem] text-foreground-muted">
              {i % labelEvery === 0 ? d.label : ""}
            </span>
          ))}
        </div>
      </div>

      <details className="mt-3">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary">
          Ver dados em tabela
        </summary>
        <div className="mt-2 max-h-60 overflow-y-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="text-left text-foreground-muted">
                <th scope="col" className="py-1 font-semibold">Período</th>
                <th scope="col" className="py-1 text-right font-semibold">{unit}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.key} className="border-t border-border/60">
                  <th scope="row" className="py-1 font-normal">{d.fullLabel}</th>
                  <td className="py-1 text-right tabular-nums">{formatNumber(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function niceCeil(value: number): number {
  const exponent = Math.pow(10, Math.floor(Math.log10(value)));
  const fraction = value / exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return Math.max(2, nice * exponent);
}

const numberFormat = new Intl.NumberFormat("pt-BR");
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}
