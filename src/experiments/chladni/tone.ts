import type { LabAudio } from '../../core/audio';

/**
 * O som da placa (ADR 0018): um oscilador senoidal na frequência do
 * excitador, mais alto na ressonância (a placa vibrando forte irradia mais).
 * Passa pelo barramento seguro do laboratório (limitador e teto de ganho);
 * liga e desliga com rampas curtas, sem estalo.
 */

export interface Tone {
  /** Liga (dentro de um gesto) ou desliga o som. */
  setEnabled(on: boolean): void;
  setFrequency(hz: number): void;
  /** 0 a 1: a amplitude da placa. */
  setLevel(level: number): void;
  dispose(): void;
}

const OWNER = 'chladni';

export function createTone(audio: LabAudio | undefined): Tone {
  let oscillator: OscillatorNode | null = null;
  let gain: GainNode | null = null;
  let frequency = 440;
  let level = 0;

  const target = (): number => 0.035 + 0.16 * Math.min(Math.max(level, 0), 1);

  function stop(): void {
    const context = audio?.context;
    if (!context || !oscillator || !gain) return;
    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0, now, 0.03);
    const old = oscillator;
    const oldGain = gain;
    old.stop(now + 0.2);
    old.onended = () => {
      old.disconnect();
      oldGain.disconnect();
    };
    oscillator = null;
    gain = null;
    audio?.setActive(OWNER, false);
  }

  return {
    setEnabled(on: boolean): void {
      if (!audio) return;
      if (!on) {
        stop();
        return;
      }
      if (oscillator) return;
      const context = audio.ensure();
      const input = audio.input;
      if (!context || !input) return;
      oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain = context.createGain();
      gain.gain.value = 0;
      oscillator.connect(gain).connect(input);
      oscillator.start();
      gain.gain.setTargetAtTime(target(), context.currentTime, 0.05);
      audio.setActive(OWNER, true);
    },

    setFrequency(hz: number): void {
      frequency = hz;
      const context = audio?.context;
      if (context && oscillator) oscillator.frequency.setTargetAtTime(hz, context.currentTime, 0.015);
    },

    setLevel(next: number): void {
      level = next;
      const context = audio?.context;
      if (context && gain) gain.gain.setTargetAtTime(target(), context.currentTime, 0.05);
    },

    dispose(): void {
      stop();
    },
  };
}
