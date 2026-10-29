"use client";

import type { DemoGenerator, PlayableTrack } from "@/types/domain";
import { generateNoise } from "./noise";

/**
 * Reprodução unificada:
 *  - faixas com arquivo → HTMLAudioElement (URL assinada do Supabase Storage);
 *  - faixas demonstrativas → Web Audio (ruído gerado + filtros).
 * Nada toca sem uma ação explícita da pessoa.
 */
export interface EngineState {
  playing: boolean;
  duration: number | null;
  position: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes: AudioNode[] = [];
  private source: AudioBufferSourceNode | null = null;
  private element: HTMLAudioElement | null = null;
  private track: PlayableTrack | null = null;
  private volume = 0.6;
  private loop = true;
  private fadeTimer: number | null = null;
  onChange: (state: EngineState) => void = () => {};
  onEnded: () => void = () => {};

  get current(): PlayableTrack | null {
    return this.track;
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    if (this.element) this.element.volume = this.volume;
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
    if (this.element) this.element.loop = loop;
  }

  async play(track: PlayableTrack): Promise<void> {
    if (this.track?.id !== track.id) this.stop();
    this.track = track;
    if (track.url) await this.playFile(track.url);
    else if (track.demo_generator) await this.playDemo(track.demo_generator);
  }

  pause(): void {
    this.cancelFade();
    if (this.element) this.element.pause();
    if (this.ctx?.state === "running") void this.ctx.suspend();
    this.emit(false);
  }

  /** Para imediatamente e libera os recursos. */
  stop(): void {
    this.cancelFade();
    if (this.element) {
      this.element.pause();
      this.element.removeAttribute("src");
      this.element.load();
      this.element = null;
    }
    try {
      this.source?.stop();
    } catch {
      // já parado
    }
    this.source = null;
    for (const node of this.nodes) {
      if (typeof OscillatorNode !== "undefined" && node instanceof OscillatorNode) node.stop();
      node.disconnect();
    }
    this.nodes = [];
    this.emit(false);
  }

  /** Diminui o volume gradualmente e para (usado pelo temporizador). */
  fadeOutAndStop(ms = 8000): void {
    this.cancelFade();
    const steps = 20;
    const start = this.volume;
    let i = 0;
    this.fadeTimer = window.setInterval(() => {
      i++;
      const v = start * (1 - i / steps);
      if (this.master && this.ctx) this.master.gain.setTargetAtTime(Math.max(0, v), this.ctx.currentTime, 0.05);
      if (this.element) this.element.volume = Math.max(0, v);
      if (i >= steps) {
        this.stop();
        this.setVolume(start);
        this.onEnded();
      }
    }, ms / steps);
  }

  seek(seconds: number): void {
    if (this.element && Number.isFinite(seconds)) this.element.currentTime = seconds;
  }

  dispose(): void {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }

  private async playFile(url: string): Promise<void> {
    if (this.ctx?.state === "running") void this.ctx.suspend();
    if (!this.element) {
      const el = new Audio();
      el.preload = "auto";
      el.src = url;
      el.loop = this.loop;
      el.volume = this.volume;
      el.addEventListener("timeupdate", () => this.emit(!el.paused));
      el.addEventListener("loadedmetadata", () => this.emit(!el.paused));
      el.addEventListener("ended", () => {
        this.emit(false);
        this.onEnded();
      });
      this.element = el;
    }
    await this.element.play();
    this.emit(true);
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private async playDemo(kind: DemoGenerator): Promise<void> {
    const ctx = this.ensureContext();
    if (!this.source) {
      const seconds = 8;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
      buffer.copyToChannel(generateNoise(kind, buffer.length, ctx.sampleRate) as Float32Array<ArrayBuffer>, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true; // sons ambientes são contínuos; o temporizador encerra
      const chain = this.buildChain(ctx, kind);
      let previous: AudioNode = source;
      for (const node of chain) {
        previous.connect(node);
        previous = node;
      }
      previous.connect(this.master!);
      source.start();
      this.source = source;
      this.nodes.push(source, ...chain);
    }
    await ctx.resume();
    this.emit(true);
  }

  /** Filtros que dão "cor" a cada som demonstrativo. */
  private buildChain(ctx: AudioContext, kind: DemoGenerator): AudioNode[] {
    const nodes: AudioNode[] = [];
    const lowpass = (freq: number) => {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = freq;
      return f;
    };
    if (kind === "fan") nodes.push(lowpass(450));
    if (kind === "rain") {
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 400;
      nodes.push(hp, lowpass(7000));
    }
    if (kind === "water" || kind === "wind") {
      const band = ctx.createBiquadFilter();
      band.type = kind === "water" ? "bandpass" : "lowpass";
      band.frequency.value = kind === "water" ? 700 : 500;
      band.Q.value = kind === "water" ? 0.6 : 0.5;
      // Oscilação lenta (0,1–0,2 Hz) para soar natural, sem pulsos perceptíveis.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = kind === "water" ? 0.17 : 0.08;
      const depth = ctx.createGain();
      depth.gain.value = kind === "water" ? 250 : 300;
      lfo.connect(depth).connect(band.frequency);
      lfo.start();
      nodes.push(band);
      this.nodes.push(lfo, depth);
    }
    return nodes;
  }

  private cancelFade(): void {
    if (this.fadeTimer !== null) window.clearInterval(this.fadeTimer);
    this.fadeTimer = null;
  }

  private emit(playing: boolean): void {
    const el = this.element;
    this.onChange({
      playing,
      duration: el && Number.isFinite(el.duration) ? el.duration : null,
      position: el?.currentTime ?? 0,
    });
  }
}
