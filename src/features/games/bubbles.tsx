"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/lib/preferences/preferences-provider";
import { useReducedMotion } from "@/lib/preferences/use-reduced-motion";
import { SOFT_COLORS } from "./catalog";

interface Bubble {
  id: number;
  x: number; // %
  size: number; // px
  color: string;
  duration: number; // s
  popping: boolean;
}

const MAX_BUBBLES = 7;

/**
 * Bolhas sobem devagar (12–18 s). Tocar faz a bolha sumir suavemente.
 * Sem pontos e sem som obrigatório. Com movimento reduzido, as bolhas
 * aparecem paradas e somem devagar.
 */
export function Bubbles() {
  const { preferences } = usePreferences();
  const still = useReducedMotion();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [paused, setPaused] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const nextId = useRef(1);
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (paused) return;
    const spawn = () =>
      setBubbles((current) => {
        if (current.length >= MAX_BUBBLES) return current;
        return [
          ...current,
          {
            id: nextId.current++,
            x: 8 + Math.random() * 78,
            size: 56 + Math.random() * 40,
            color: SOFT_COLORS[Math.floor(Math.random() * SOFT_COLORS.length)]!,
            duration: 12 + Math.random() * 6,
            popping: false,
          },
        ];
      });
    spawn();
    const timer = window.setInterval(spawn, 2600);
    return () => window.clearInterval(timer);
  }, [paused]);

  function remove(id: number) {
    setBubbles((current) => current.filter((b) => b.id !== id));
  }

  function pop(id: number) {
    setBubbles((current) => current.map((b) => (b.id === id ? { ...b, popping: true } : b)));
    window.setTimeout(() => remove(id), 400);
    if (soundOn && preferences.soundsEnabled) playPlop();
  }

  function playPlop() {
    audio.current ??= new AudioContext();
    const ctx = audio.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  }

  useEffect(() => () => void audio.current?.close(), []);

  return (
    <div className="space-y-4">
      <div className="relative h-[60dvh] min-h-80 overflow-hidden rounded-2xl border border-border bg-sky-soft">
        {bubbles.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => pop(b.id)}
            onAnimationEnd={(e) => e.animationName === "bubble-rise" && remove(b.id)}
            aria-label="Bolha"
            className="absolute rounded-full border-2 border-white/60"
            style={{
              left: `${b.x}%`,
              width: b.size,
              height: b.size,
              top: still ? `${15 + (b.id * 37) % 60}%` : undefined,
              bottom: still ? undefined : -b.size,
              background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,.75), ${b.color}cc 60%)`,
              opacity: b.popping ? 0 : 0.9,
              transform: b.popping ? "scale(1.25)" : undefined,
              transition: "opacity 400ms ease, transform 400ms ease",
              animation: still || paused ? undefined : `bubble-rise ${b.duration}s linear forwards`,
            }}
          />
        ))}
        {bubbles.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-foreground-muted">
            {paused ? "Pausado." : "As bolhas vão aparecer devagar…"}
          </p>
        )}
      </div>
      <style>{`@keyframes bubble-rise { from { transform: translateY(0) } to { transform: translateY(calc(-60dvh - 200px)) } }`}</style>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setPaused((p) => !p)}>
          {paused ? "Continuar" : "Pausar bolhas"}
        </Button>
        <Button variant="ghost" onClick={() => bubbles[0] && pop(bubbles[0].id)} disabled={bubbles.length === 0}>
          Estourar uma bolha
        </Button>
        {preferences.soundsEnabled && (
          <label className="flex min-h-11 items-center gap-2 px-2 font-semibold">
            <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={soundOn} onChange={(e) => setSoundOn(e.target.checked)} />
            Som baixinho ao tocar
          </label>
        )}
      </div>
    </div>
  );
}
