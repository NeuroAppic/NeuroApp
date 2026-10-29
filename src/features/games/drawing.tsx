"use client";

import { Download, Eraser, Paintbrush, Trash2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SOFT_COLORS } from "./catalog";

interface Stroke {
  color: string | null; // null = borracha
  size: number;
  points: [number, number][]; // coordenadas normalizadas 0–1
}

const SIZES = [{ label: "Fino", value: 4 }, { label: "Médio", value: 10 }, { label: "Grosso", value: 20 }];
const KEY_STEP = 0.02;

/**
 * Desenho livre em canvas. Traços guardados como vetores normalizados, então
 * redesenham bem ao girar a tela. Alternativa sem arrastar: com o quadro em
 * foco, as setas movem a caneta e Espaço levanta/abaixa a caneta.
 */
export function Drawing() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState<string>(SOFT_COLORS[1]);
  const [eraser, setEraser] = useState(false);
  const [size, setSize] = useState(10);
  const current = useRef<Stroke | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const [cursor, setCursor] = useState<{ x: number; y: number; down: boolean }>({ x: 0.5, y: 0.5, down: false });

  const redraw = useCallback(
    (list: Stroke[]) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#fffdf9";
      ctx.fillRect(0, 0, width, height);
      for (const s of list) {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = s.size * (window.devicePixelRatio || 1);
        ctx.strokeStyle = s.color ?? "#fffdf9";
        ctx.beginPath();
        s.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * width, y * height) : ctx.lineTo(x * width, y * height)));
        if (s.points.length === 1) ctx.lineTo(s.points[0]![0] * width + 0.1, s.points[0]![1] * height);
        ctx.stroke();
      }
    },
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      redraw(strokesRef.current);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  useEffect(() => {
    strokesRef.current = strokes;
    redraw(strokes);
  }, [strokes, redraw]);

  function point(e: PointerEvent<HTMLCanvasElement>): [number, number] {
    const rect = e.currentTarget.getBoundingClientRect();
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height];
  }

  function onDown(e: PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    current.current = { color: eraser ? null : color, size: eraser ? size * 2 : size, points: [point(e)] };
    redraw([...strokes, current.current]);
  }
  function onMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!current.current) return;
    current.current.points.push(point(e));
    redraw([...strokes, current.current]);
  }
  function onUp() {
    if (current.current) setStrokes((s) => [...s, current.current!]);
    current.current = null;
  }

  function onKeyDown(e: KeyboardEvent<HTMLCanvasElement>) {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, -KEY_STEP], ArrowDown: [0, KEY_STEP], ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0],
    };
    if (e.key === " ") {
      e.preventDefault();
      setCursor((c) => {
        const down = !c.down;
        if (down) setStrokes((s) => [...s, { color: eraser ? null : color, size, points: [[c.x, c.y]] }]);
        return { ...c, down };
      });
      return;
    }
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    setCursor((c) => {
      const next = { ...c, x: Math.min(1, Math.max(0, c.x + move[0])), y: Math.min(1, Math.max(0, c.y + move[1])) };
      if (c.down) {
        setStrokes((s) => {
          const last = s.at(-1);
          if (!last) return s;
          return [...s.slice(0, -1), { ...last, points: [...last.points, [next.x, next.y]] }];
        });
      }
      return next;
    });
  }

  function save() {
    const url = canvasRef.current?.toDataURL("image/png");
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = "meu-desenho.png";
    a.click();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Cores">
        {SOFT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Cor ${SOFT_COLORS.indexOf(c) + 1}`}
            aria-pressed={!eraser && color === c}
            onClick={() => { setColor(c); setEraser(false); }}
            className="size-11 rounded-full border-2 border-border aria-pressed:ring-4 aria-pressed:ring-focus aria-pressed:ring-offset-2 aria-pressed:ring-offset-background"
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant={eraser ? "secondary" : "soft"} size="sm" aria-pressed={!eraser} onClick={() => setEraser(false)}>
          <Paintbrush aria-hidden /> Pincel
        </Button>
        <Button variant={eraser ? "soft" : "secondary"} size="sm" aria-pressed={eraser} onClick={() => setEraser(true)}>
          <Eraser aria-hidden /> Apagar
        </Button>
        {SIZES.map((s) => (
          <Button key={s.value} size="sm" variant={size === s.value ? "soft" : "ghost"} aria-pressed={size === s.value} onClick={() => setSize(s.value)}>
            {s.label}
          </Button>
        ))}
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="img"
          aria-label="Quadro de desenho. Com o quadro em foco, use as setas para mover a caneta e Espaço para começar ou parar de desenhar."
          className="peer h-[55dvh] min-h-72 w-full touch-none rounded-2xl border border-border"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onKeyDown}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute hidden size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground peer-focus-visible:block"
          style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%`, background: cursor.down ? "var(--foreground)" : "transparent" }}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setStrokes((s) => s.slice(0, -1))} disabled={strokes.length === 0}>
          <Undo2 aria-hidden /> Desfazer
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" disabled={strokes.length === 0}>
              <Trash2 aria-hidden /> Limpar tudo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Limpar o desenho?</DialogTitle>
            <DialogDescription>O quadro fica em branco. Isso não pode ser desfeito.</DialogDescription>
            <div className="mt-5 flex gap-2">
              <DialogClose asChild>
                <Button onClick={() => setStrokes([])}>Sim, limpar</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="secondary">Manter</Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
        <Button variant="ghost" onClick={save} disabled={strokes.length === 0}>
          <Download aria-hidden /> Salvar imagem
        </Button>
      </div>
    </div>
  );
}
