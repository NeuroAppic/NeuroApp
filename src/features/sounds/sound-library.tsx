"use client";

import { Pause, Play, Repeat, SlidersHorizontal, Square, Timer, Volume1, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Slider } from "@/components/ui/slider";
import { usePreferences } from "@/lib/preferences/preferences-provider";
import { cn } from "@/lib/utils";
import type { AudioCategory, PlayableTrack } from "@/types/domain";
import { AudioEngine, type EngineState } from "./audio-engine";
import { CATEGORY_LABEL } from "./catalog";
import { TrackIcon } from "./track-icon";

const PLAYER_KEY = "acolher:player:v1";
const TIMER_OPTIONS = [0, 10, 20, 30, 45, 60, 90] as const;

interface PlayerPrefs {
  volume: number;
  loop: boolean;
  timerMinutes: number;
}

function minutesFromNow(minutes: number): number {
  return Date.now() + minutes * 60_000;
}

function readPlayerPrefs(): PlayerPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PLAYER_KEY) ?? "null") as Partial<PlayerPrefs> | null;
    return {
      volume: typeof raw?.volume === "number" ? raw.volume : 0.6,
      loop: raw?.loop ?? true,
      timerMinutes: typeof raw?.timerMinutes === "number" ? raw.timerMinutes : 0,
    };
  } catch {
    return { volume: 0.6, loop: true, timerMinutes: 0 };
  }
}

export function SoundLibrary({ tracks, demo }: { tracks: PlayableTrack[]; demo: boolean }) {
  const { preferences } = usePreferences();
  const engineRef = useRef<AudioEngine | null>(null);
  const [selected, setSelected] = useState<PlayableTrack | null>(null);
  const [engineState, setEngineState] = useState<EngineState>({ playing: false, duration: null, position: 0 });
  const [prefs, setPrefs] = useState<PlayerPrefs>({ volume: 0.6, loop: true, timerMinutes: 0 });
  const [timerEndsAt, setTimerEndsAt] = useState<number | null>(null);
  const [category, setCategory] = useState<AudioCategory | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [controlsOpen, setControlsOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do armazenamento local
    setPrefs(readPlayerPrefs());
    const engine = new AudioEngine();
    engine.onChange = setEngineState;
    engine.onEnded = () => setTimerEndsAt(null);
    engineRef.current = engine;
    return () => engine.dispose();
  }, []);

  useEffect(() => {
    engineRef.current?.setVolume(prefs.volume);
    engineRef.current?.setLoop(prefs.loop);
    try {
      localStorage.setItem(PLAYER_KEY, JSON.stringify(prefs));
    } catch {
      // armazenamento indisponível
    }
  }, [prefs]);

  // Desligar "Permitir sons" para qualquer reprodução na hora.
  useEffect(() => {
    if (!preferences.soundsEnabled) engineRef.current?.stop();
  }, [preferences.soundsEnabled]);

  // Temporizador: ao terminar, o som diminui aos poucos e para.
  useEffect(() => {
    if (timerEndsAt === null || !engineState.playing) return;
    const ms = Math.max(0, timerEndsAt - Date.now());
    const t = window.setTimeout(() => engineRef.current?.fadeOutAndStop(), ms);
    return () => window.clearTimeout(t);
  }, [timerEndsAt, engineState.playing]);

  const categories = useMemo(() => Array.from(new Set(tracks.map((t) => t.category))), [tracks]);
  const visible = category === "all" ? tracks : tracks.filter((t) => t.category === category);

  async function toggle(track: PlayableTrack) {
    setError(null);
    const engine = engineRef.current;
    if (!engine || !preferences.soundsEnabled) return;
    if (selected?.id === track.id && engineState.playing) {
      engine.pause();
      return;
    }
    setSelected(track);
    try {
      await engine.play(track);
      if (prefs.timerMinutes > 0) setTimerEndsAt(minutesFromNow(prefs.timerMinutes));
    } catch {
      setError("Não foi possível tocar este som agora.");
    }
  }

  function stop() {
    engineRef.current?.stop();
    setTimerEndsAt(null);
  }

  const VolumeIcon = prefs.volume === 0 ? VolumeX : prefs.volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="space-y-6">
      {demo && (
        <Notice tone="sky">
          <p>
            <strong>Sons demonstrativos:</strong> gerados no próprio navegador enquanto os áudios oficiais
            não são enviados. Eles são aproximações simples.
          </p>
        </Notice>
      )}
      {!preferences.soundsEnabled && (
        <Notice tone="neutral" icon={<VolumeX aria-hidden />}>
          Os sons estão desligados nas suas{" "}
          <Link href="/configuracoes" className="font-semibold underline underline-offset-4">configurações</Link>.
        </Notice>
      )}

      {categories.length > 1 && (
        <div role="group" aria-label="Filtrar por categoria" className="flex flex-wrap gap-2">
          <Chip active={category === "all"} onClick={() => setCategory("all")}>Todos</Chip>
          {categories.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {CATEGORY_LABEL[c]}
            </Chip>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-foreground-muted">Nenhum som publicado nesta categoria ainda.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((track) => {
            const isCurrent = selected?.id === track.id;
            const playing = isCurrent && engineState.playing;
            return (
              <li key={track.id}>
                <button
                  type="button"
                  onClick={() => void toggle(track)}
                  disabled={!preferences.soundsEnabled}
                  aria-pressed={playing}
                  className={cn(
                    "flex w-full items-center gap-4 rounded-2xl border bg-surface p-4 text-left shadow-soft disabled:opacity-60",
                    isCurrent ? "border-primary" : "border-border hover:bg-surface-muted",
                  )}
                >
                  <span
                    className="inline-flex size-14 shrink-0 items-center justify-center rounded-2xl text-foreground"
                    style={{ backgroundColor: `${track.color}55` }}
                  >
                    <TrackIcon name={track.icon} className="size-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{track.title}</span>
                    <span className="block text-sm text-foreground-muted">{CATEGORY_LABEL[track.category]}</span>
                    {track.is_demo && <Badge tone="neutral" className="mt-1 px-2 py-0.5 text-xs">Demonstração</Badge>}
                  </span>
                  <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    {playing ? <Pause className="size-5" aria-hidden /> : <Play className="size-5" aria-hidden />}
                    <span className="sr-only">{playing ? "Pausar" : "Tocar"} {track.title}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error && <p role="alert" className="font-medium text-danger">{error}</p>}

      {/* Player fixo e discreto */}
      <section
        aria-label="Player"
        className="sticky bottom-20 z-30 rounded-2xl border border-border bg-surface/95 p-4 shadow-soft backdrop-blur-sm md:bottom-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold" aria-live="polite">
              {selected ? selected.title : "Escolha um som para começar"}
            </p>
            <p className="text-sm text-foreground-muted">
              {selected ? (engineState.playing ? "Tocando" : "Pausado") : "Nada toca sem você apertar o play."}
              {timerEndsAt && engineState.playing && ` · desliga às ${new Date(timerEndsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              onClick={() => selected && void toggle(selected)}
              disabled={!selected || !preferences.soundsEnabled}
              aria-label={engineState.playing ? "Pausar" : "Tocar"}
            >
              {engineState.playing ? <Pause aria-hidden /> : <Play aria-hidden />}
            </Button>
            <Button size="icon" variant="secondary" onClick={stop} disabled={!selected} aria-label="Parar agora">
              <Square aria-hidden />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="sm:hidden"
              aria-expanded={controlsOpen}
              aria-controls="ajustes-player"
              aria-label={controlsOpen ? "Esconder ajustes do som" : "Mostrar ajustes do som"}
              onClick={() => setControlsOpen((v) => !v)}
            >
              <SlidersHorizontal aria-hidden />
            </Button>
          </div>
        </div>

        {engineState.duration && selected?.url && (
          <div className="mt-3">
            <Slider
              thumbLabel="Posição da reprodução"
              min={0}
              max={Math.floor(engineState.duration)}
              step={1}
              value={[Math.floor(engineState.position)]}
              onValueChange={([v]) => engineRef.current?.seek(v ?? 0)}
            />
          </div>
        )}

        {/* No celular, os ajustes ficam recolhidos para o player não cobrir a lista. */}
        <div
          id="ajustes-player"
          className={cn("mt-3 gap-3 sm:grid sm:grid-cols-[1fr_auto_auto] sm:items-center", controlsOpen ? "grid" : "hidden")}
        >
          <div className="flex items-center gap-3">
            <VolumeIcon className="size-5 shrink-0 text-foreground-muted" aria-hidden />
            <Slider
              thumbLabel="Volume"
              min={0}
              max={100}
              step={5}
              value={[Math.round(prefs.volume * 100)]}
              onValueChange={([v]) => setPrefs((p) => ({ ...p, volume: (v ?? 0) / 100 }))}
            />
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              className="size-5 accent-[var(--primary)]"
              checked={prefs.loop}
              onChange={(e) => setPrefs((p) => ({ ...p, loop: e.target.checked }))}
            />
            <Repeat className="size-4" aria-hidden /> Repetir
          </label>
          <div className="flex items-center gap-2">
            <Timer className="size-4 text-foreground-muted" aria-hidden />
            <label htmlFor="temporizador" className="sr-only">Temporizador</label>
            <Select
              id="temporizador"
              className="min-h-11 py-0 text-sm"
              value={prefs.timerMinutes}
              onChange={(e) => {
                const minutes = Number(e.target.value);
                setPrefs((p) => ({ ...p, timerMinutes: minutes }));
                setTimerEndsAt(minutes > 0 && engineState.playing ? minutesFromNow(minutes) : null);
              }}
            >
              {TIMER_OPTIONS.map((m) => (
                <option key={m} value={m}>{m === 0 ? "Sem temporizador" : `Desligar em ${m} min`}</option>
              ))}
            </Select>
          </div>
        </div>
      </section>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold aria-pressed:border-primary aria-pressed:bg-primary-soft"
    >
      {children}
    </button>
  );
}
