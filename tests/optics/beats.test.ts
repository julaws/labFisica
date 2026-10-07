import { describe, expect, it } from 'vitest';
import {
  INTERVALS,
  beatFrequency,
  beatPeriod,
  envelope,
  equalTempered,
  harmonicBeats,
  harmonics,
  measureBeatFrequency,
  mix,
  phasorAngles,
  sumToProduct,
  waveformValue,
} from '../../src/optics/acoustics/beats';

/** Batimentos (ADR 0019). */

function sampled(f1: number, f2: number, seconds: number, rate = 44_100, a1 = 1, a2 = 1): Float32Array {
  const samples = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < samples.length; i += 1) {
    const t = i / rate;
    samples[i] = mix(
      [
        { frequency: f1, amplitude: a1, waveform: 'sine' },
        { frequency: f2, amplitude: a2, waveform: 'sine' },
      ],
      t,
    );
  }
  return samples;
}

describe('identidade soma-produto', () => {
  it('sen(2πf₁t) + sen(2πf₂t) = 2cos(π(f₁ − f₂)t)·sen(π(f₁ + f₂)t)', () => {
    for (const [f1, f2] of [
      [440, 443],
      [220, 220.5],
      [100, 117],
    ] as const) {
      for (let k = 0; k < 200; k += 1) {
        const t = k * 0.01237;
        const { sum, product } = sumToProduct(f1, f2, t);
        expect(sum).toBeCloseTo(product, 10);
      }
    }
  });
});

describe('frequência de batimento', () => {
  it('a envoltória medida no sinal bate |f₁ − f₂| vezes por segundo', () => {
    for (const [f1, f2] of [
      [440, 443],
      [220, 220.5],
      [330, 318],
      [500, 520],
    ] as const) {
      const beat = beatFrequency(f1, f2);
      const seconds = Math.max(2, 6 / beat);
      const measured = measureBeatFrequency(sampled(f1, f2, seconds), 44_100, (f1 + f2) / 2);
      expect(measured).toBeCloseTo(beat, 1);
      expect(Math.abs(measured / beat - 1)).toBeLessThan(0.01);
    }
  });

  it('com amplitudes diferentes a envoltória não zera e o batimento é o mesmo', () => {
    const measured = measureBeatFrequency(sampled(400, 404, 3, 44_100, 1, 0.5), 44_100, 402);
    expect(measured).toBeCloseTo(4, 1);
    expect(envelope(1, 0.5, 400, 404, 0.125)).toBeCloseTo(0.5, 9);
    expect(envelope(1, 0.5, 400, 404, 0)).toBeCloseTo(1.5, 9);
  });

  it('a envoltória acompanha os picos da soma', () => {
    const rate = 96_000;
    const samples = sampled(440, 446, 1, rate, 0.8, 0.6);
    // No pico de cada ciclo da portadora, |s| ≈ envoltória.
    for (const t of [0.05, 0.11, 0.27, 0.4]) {
      const i0 = Math.round(t * rate);
      let peak = 0;
      for (let i = i0; i < i0 + Math.round(rate / 443); i += 1) peak = Math.max(peak, Math.abs(samples[i]!));
      expect(peak).toBeCloseTo(envelope(0.8, 0.6, 440, 446, t), 1);
    }
  });

  it('período de batimento e uníssono', () => {
    expect(beatPeriod(440, 442)).toBeCloseTo(0.5, 12);
    expect(beatPeriod(440, 440)).toBe(Number.POSITIVE_INFINITY);
  });

  it('fasores giram em sentidos opostos a ±π(f₁ − f₂)t', () => {
    const { first, second } = phasorAngles(441, 440, 0.5);
    expect(first).toBeCloseTo(Math.PI / 2, 12);
    expect(second).toBeCloseTo(-Math.PI / 2, 12);
    // Opostos: a resultante zera exatamente no meio do período de batimento.
    expect(Math.cos(first - second)).toBeCloseTo(-1, 12);
  });
});

describe('timbres', () => {
  it('as formas de onda têm amplitude 1 e o período certo', () => {
    for (const waveform of ['sine', 'square', 'sawtooth', 'triangle'] as const) {
      let max = 0;
      for (let k = 0; k < 1000; k += 1) max = Math.max(max, Math.abs(waveformValue(waveform, k / 1000)));
      expect(max).toBeCloseTo(1, 2);
      expect(waveformValue(waveform, 0.3)).toBeCloseTo(waveformValue(waveform, 1.3), 12);
    }
  });

  it('a série de Fourier da quadrada converge para a quadrada', () => {
    const series = harmonics('square', 1, 401);
    const at = (p: number): number => series.reduce((sum, h) => sum + h.amplitude * Math.sin(2 * Math.PI * h.frequency * p), 0);
    expect(at(0.25)).toBeCloseTo(1, 2);
    expect(at(0.75)).toBeCloseTo(-1, 2);
  });

  it('numa quinta temperada, 3f₁ e 2f₂ batem a 0,74 Hz (lá 220 Hz)', () => {
    const f1 = 220;
    const f2 = equalTempered(INTERVALS.fifth.semitones - 12);
    expect(f2).toBeCloseTo(329.628, 3);
    const pairs = harmonicBeats(
      { frequency: f1, amplitude: 1, waveform: 'sawtooth' },
      { frequency: f2, amplitude: 1, waveform: 'sawtooth' },
    );
    const fifth = pairs.find((pair) => pair.p === 3 && pair.q === 2)!;
    expect(fifth.beat).toBeCloseTo(0.745, 2);
    // Na quinta justa (3/2), o mesmo par não bate.
    const just = harmonicBeats(
      { frequency: f1, amplitude: 1, waveform: 'sawtooth' },
      { frequency: f1 * 1.5, amplitude: 1, waveform: 'sawtooth' },
    ).find((pair) => pair.p === 3 && pair.q === 2)!;
    expect(just.beat).toBeCloseTo(0, 9);
  });
});
