/**
 * Geradores de som para as faixas DEMONSTRATIVAS (sem arquivo).
 * Funções puras sobre Float32Array, testáveis sem navegador.
 */
import type { DemoGenerator } from "@/types/domain";

export function fillWhite(out: Float32Array, random = Math.random): void {
  for (let i = 0; i < out.length; i++) out[i] = random() * 2 - 1;
}

/** Ruído rosa (filtro de Paul Kellet). */
export function fillPink(out: Float32Array, random = Math.random): void {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < out.length; i++) {
    const white = random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
}

/** Ruído marrom: integração do branco com vazamento (evita deriva). */
export function fillBrown(out: Float32Array, random = Math.random): void {
  let last = 0;
  for (let i = 0; i < out.length; i++) {
    const white = random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    out[i] = last * 3.5;
  }
}

/** Gotas esparsas e suaves somadas a uma base rosa (aproximação de chuva). */
export function fillRain(out: Float32Array, sampleRate: number, random = Math.random): void {
  fillPink(out, random);
  for (let i = 0; i < out.length; i++) out[i]! *= 0.6;
  const drops = Math.floor((out.length / sampleRate) * 40);
  for (let d = 0; d < drops; d++) {
    const start = Math.floor(random() * out.length);
    const amp = 0.05 + random() * 0.12;
    const len = Math.floor(sampleRate * (0.004 + random() * 0.01));
    for (let k = 0; k < len && start + k < out.length; k++) {
      out[start + k]! += amp * (random() * 2 - 1) * Math.exp((-6 * k) / len);
    }
  }
}

/**
 * Suaviza as bordas para o laço não "estalar": as últimas amostras se
 * misturam às primeiras (crossfade).
 */
export function makeSeamless(out: Float32Array, fadeSamples: number): void {
  const n = Math.min(fadeSamples, Math.floor(out.length / 4));
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const head = out[i]!;
    const tail = out[out.length - n + i]!;
    out[i] = head * t + tail * (1 - t);
  }
}

export function generateNoise(kind: DemoGenerator, length: number, sampleRate: number): Float32Array {
  const out = new Float32Array(length);
  switch (kind) {
    case "white":
      fillWhite(out);
      for (let i = 0; i < out.length; i++) out[i]! *= 0.35;
      break;
    case "pink":
    case "water":
    case "wind":
      fillPink(out);
      break;
    case "brown":
    case "fan":
      fillBrown(out);
      break;
    case "rain":
      fillRain(out, sampleRate);
      break;
  }
  makeSeamless(out, Math.floor(sampleRate * 0.25));
  return out;
}
