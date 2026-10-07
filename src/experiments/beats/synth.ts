import type { LabAudio } from '../../core/audio';
import type { Waveform } from '../../optics/acoustics/beats';

/**
 * O sintetizador dos batimentos (ADR 0019): dois osciladores Web Audio, cada
 * um com o seu ganho, somados e analisados.
 *
 *     osc₁ → A₁ ┐
 *               ├→ mistura → analisador → volume → barramento seguro (ADR 0016)
 *     osc₂ → A₂ ┘
 *
 * - Nada é criado antes de `wake()`, chamado num gesto da pessoa.
 * - O analisador fica antes do volume: com o som mudo, o espectro continua
 *   medido ao vivo (o AnalyserNode lê a mistura, o volume só decide o que sai).
 * - A mistura tem ganho 0,22: duas ondas quadradas em fase não passam do
 *   limitador; o volume vai de 0 a 1 por cima disso.
 * - Os osciladores do navegador são limitados em banda (sem aliasing).
 */

export interface SynthSettings {
  readonly f1: number;
  readonly f2: number;
  readonly a1: number;
  readonly a2: number;
  readonly waveform: Waveform;
  /** 0 a 1. */
  readonly volume: number;
  readonly audible: boolean;
}

export interface Synth {
  /** Cria os nós (dentro de um gesto). Devolve false sem Web Audio. */
  wake(): boolean;
  readonly awake: boolean;
  apply(settings: SynthSettings): void;
  /** Espectro medido (dB por faixa), ou null antes de acordar. */
  readonly analyser: AnalyserNode | null;
  readonly sampleRate: number;
  dispose(): void;
}

const OWNER = 'beats';
const MIX = 0.22;

export function createSynth(audio: LabAudio | undefined): Synth {
  let osc1: OscillatorNode | null = null;
  let osc2: OscillatorNode | null = null;
  let gain1: GainNode | null = null;
  let gain2: GainNode | null = null;
  let mix: GainNode | null = null;
  let analyser: AnalyserNode | null = null;
  let volume: GainNode | null = null;
  let last: SynthSettings | null = null;
  let sounding = false;

  const apply = (settings: SynthSettings): void => {
    last = settings;
    const context = audio?.context;
    if (!context || !osc1 || !osc2 || !gain1 || !gain2 || !volume) return;
    const now = context.currentTime;
    if (osc1.type !== settings.waveform) osc1.type = settings.waveform;
    if (osc2.type !== settings.waveform) osc2.type = settings.waveform;
    osc1.frequency.setTargetAtTime(settings.f1, now, 0.01);
    osc2.frequency.setTargetAtTime(settings.f2, now, 0.01);
    gain1.gain.setTargetAtTime(settings.a1, now, 0.03);
    gain2.gain.setTargetAtTime(settings.a2, now, 0.03);
    volume.gain.setTargetAtTime(settings.audible ? settings.volume : 0, now, 0.04);
    const nowSounding = settings.audible && settings.volume > 0;
    if (nowSounding !== sounding) {
      sounding = nowSounding;
      audio?.setActive(OWNER, sounding);
    }
  };

  return {
    wake(): boolean {
      if (osc1) return true;
      if (!audio) return false;
      const context = audio.ensure();
      const input = audio.input;
      if (!context || !input) return false;
      osc1 = context.createOscillator();
      osc2 = context.createOscillator();
      gain1 = context.createGain();
      gain2 = context.createGain();
      mix = context.createGain();
      mix.gain.value = MIX;
      analyser = context.createAnalyser();
      analyser.fftSize = 16384;
      analyser.smoothingTimeConstant = 0.6;
      analyser.minDecibels = -100;
      analyser.maxDecibels = -10;
      volume = context.createGain();
      volume.gain.value = 0;
      gain1.gain.value = 0;
      gain2.gain.value = 0;
      osc1.connect(gain1).connect(mix);
      osc2.connect(gain2).connect(mix);
      mix.connect(analyser).connect(volume).connect(input);
      osc1.start();
      osc2.start();
      if (last) apply(last);
      return true;
    },
    get awake(): boolean {
      return osc1 !== null;
    },
    apply,
    get analyser(): AnalyserNode | null {
      return analyser;
    },
    get sampleRate(): number {
      return audio?.context?.sampleRate ?? 48000;
    },
    dispose(): void {
      const context = audio?.context;
      if (context && volume) volume.gain.setTargetAtTime(0, context.currentTime, 0.02);
      const nodes = [osc1, osc2];
      const rest = [gain1, gain2, mix, analyser, volume];
      for (const node of nodes) {
        if (!node) continue;
        node.stop((context?.currentTime ?? 0) + 0.15);
        node.onended = () => {
          node.disconnect();
          for (const other of rest) other?.disconnect();
        };
      }
      if (sounding) audio?.setActive(OWNER, false);
      sounding = false;
      osc1 = osc2 = null;
      gain1 = gain2 = mix = volume = null;
      analyser = null;
    },
  };
}
