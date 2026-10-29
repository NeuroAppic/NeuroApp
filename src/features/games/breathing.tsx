"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/lib/preferences/use-reduced-motion";

/** Ritmos sem retenção de ar: apenas inspirar e expirar. */
export const RHYTHMS = [
  { id: "curto", label: "Mais curto (3 s)", inhale: 3, exhale: 3 },
  { id: "suave", label: "Suave (4 s)", inhale: 4, exhale: 4 },
  { id: "lento", label: "Mais lento (4 s / 6 s)", inhale: 4, exhale: 6 },
] as const;

export function breathingPhase(elapsedSeconds: number, inhale: number, exhale: number) {
  const cycle = inhale + exhale;
  const t = elapsedSeconds % cycle;
  return t < inhale
    ? { phase: "inhale" as const, progress: t / inhale }
    : { phase: "exhale" as const, progress: (t - inhale) / exhale };
}

/**
 * Respiração totalmente voluntária: só começa com um toque, para na hora.
 * Com movimento reduzido, o círculo não muda de tamanho — mostra só texto e
 * uma barra de progresso discreta.
 */
export function Breathing() {
  const reduced = useReducedMotion();
  const [rhythmId, setRhythmId] = useState<(typeof RHYTHMS)[number]["id"]>("suave");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const rhythm = RHYTHMS.find((r) => r.id === rhythmId)!;

  useEffect(() => {
    if (startedAt === null) return;
    let frame = 0;
    const tick = () => {
      setNow(performance.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [startedAt]);

  const running = startedAt !== null;
  const { phase, progress } = running
    ? breathingPhase(Math.max(0, (now - startedAt) / 1000), rhythm.inhale, rhythm.exhale)
    : { phase: "inhale" as const, progress: 0 };
  // Facilidade senoidal: o tamanho muda devagar no início e no fim de cada fase.
  const eased = (1 - Math.cos(Math.PI * progress)) / 2;
  const scale = !running ? 0.7 : phase === "inhale" ? 0.6 + 0.4 * eased : 1 - 0.4 * eased;

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="max-w-xl text-center text-foreground-muted">
        Acompanhe só se fizer bem. Respire no seu ritmo — você não precisa seguir o círculo. Se sentir
        qualquer desconforto, pare.
      </p>

      <div className="relative flex size-72 items-center justify-center sm:size-80" aria-hidden>
        <div
          className="absolute inset-0 rounded-full bg-primary-soft"
          style={{ transform: `scale(${reduced ? 0.85 : scale})` }}
        />
        <div
          className="absolute inset-8 rounded-full bg-lavender-soft opacity-70"
          style={{ transform: `scale(${reduced ? 0.85 : scale})` }}
        />
        <span className="relative text-2xl font-semibold">
          {running ? (phase === "inhale" ? "Inspire" : "Expire") : "Pronto quando você quiser"}
        </span>
      </div>

      {running && reduced && (
        <div className="h-2 w-64 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
          <div className="h-full bg-primary" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {running ? (phase === "inhale" ? "Inspire" : "Expire") : ""}
      </p>

      <div className="flex flex-col items-center gap-3">
        {running ? (
          <Button size="lg" variant="secondary" onClick={() => setStartedAt(null)}>
            Parar
          </Button>
        ) : (
          <Button size="lg" onClick={() => { const t = performance.now(); setNow(t); setStartedAt(t); }}>
            Começar
          </Button>
        )}
        <fieldset className="flex flex-wrap justify-center gap-2">
          <legend className="sr-only">Ritmo</legend>
          {RHYTHMS.map((r) => (
            <label key={r.id} className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-border px-4 text-sm font-semibold has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:outline-3 has-focus-visible:outline-focus">
              <input type="radio" name="ritmo" className="sr-only" checked={rhythmId === r.id} onChange={() => setRhythmId(r.id)} />
              {r.label}
            </label>
          ))}
        </fieldset>
      </div>
    </div>
  );
}
