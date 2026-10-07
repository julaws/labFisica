/**
 * Batimentos (ADR 0019): duas ondas de frequências próximas somadas.
 *
 * TypeScript puro. Tempo em segundos, frequências em Hz.
 *
 * ## A identidade
 *
 *     sen(2πf₁t) + sen(2πf₂t) = 2·cos(π(f₁ − f₂)t)·sen(π(f₁ + f₂)t)
 *
 * A soma é uma onda na frequência média, (f₁ + f₂)/2, com a amplitude
 * modulada por 2·cos(π(f₁ − f₂)t). O ouvido sente o volume subir e descer
 * cada vez que |cos| passa por um máximo: |f₁ − f₂| vezes por segundo — a
 * frequência de batimento. Com amplitudes diferentes, a envoltória é
 * √(A₁² + A₂² + 2A₁A₂·cos(2π(f₁ − f₂)t)): nunca chega a zero.
 *
 * ## Fasores
 *
 * Cada onda é a projeção de um vetor girando a 2πf. Vistos num referencial
 * que gira com a frequência média, os dois vetores giram devagar em sentidos
 * opostos, a ±π(f₁ − f₂): a resultante cresce quando se alinham e some quando
 * ficam opostos.
 *
 * ## Timbres
 *
 * Quadrada, dente de serra e triangular são somas de harmônicos (Fourier). Com
 * eles, dois intervalos "quase certos" batem entre harmônicos: numa quinta
 * temperada, o 3º harmônico da nota de baixo e o 2º da de cima diferem por
 * menos de 1 Hz — é esse batimento lento que os afinadores escutam.
 */

export type Waveform = 'sine' | 'square' | 'sawtooth' | 'triangle';

export interface Voice {
  readonly frequency: number;
  readonly amplitude: number;
  readonly waveform: Waveform;
}

/** Forma de onda periódica de amplitude 1, fase φ em ciclos (0 a 1). */
export function waveformValue(waveform: Waveform, cycles: number): number {
  const p = cycles - Math.floor(cycles);
  switch (waveform) {
    case 'sine':
      return Math.sin(2 * Math.PI * p);
    case 'square':
      return p < 0.5 ? 1 : -1;
    case 'sawtooth':
      // Sobe de −1 a 1 e cai: em fase com o seno no começo do ciclo.
      return p < 0.5 ? 2 * p : 2 * p - 2;
    case 'triangle':
      return p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4;
  }
}

/** Valor de uma voz no instante t. */
export function voiceValue(voice: Voice, t: number): number {
  return voice.amplitude * waveformValue(voice.waveform, voice.frequency * t);
}

/** Soma das vozes no instante t. */
export function mix(voices: readonly Voice[], t: number): number {
  let sum = 0;
  for (const voice of voices) sum += voiceValue(voice, t);
  return sum;
}

/** Frequência de batimento |f₁ − f₂|, Hz. */
export function beatFrequency(f1: number, f2: number): number {
  return Math.abs(f1 - f2);
}

/** Período de batimento 1/|f₁ − f₂|, s (infinito no uníssono). */
export function beatPeriod(f1: number, f2: number): number {
  const beat = beatFrequency(f1, f2);
  return beat > 0 ? 1 / beat : Number.POSITIVE_INFINITY;
}

/** Os dois lados da identidade soma-produto, para conferir numericamente. */
export function sumToProduct(f1: number, f2: number, t: number): { sum: number; product: number } {
  return {
    sum: Math.sin(2 * Math.PI * f1 * t) + Math.sin(2 * Math.PI * f2 * t),
    product: 2 * Math.cos(Math.PI * (f1 - f2) * t) * Math.sin(Math.PI * (f1 + f2) * t),
  };
}

/** Envoltória da soma de duas senoides: √(A₁² + A₂² + 2A₁A₂·cos(2πΔf·t)). */
export function envelope(a1: number, a2: number, f1: number, f2: number, t: number): number {
  return Math.sqrt(Math.max(0, a1 * a1 + a2 * a2 + 2 * a1 * a2 * Math.cos(2 * Math.PI * (f1 - f2) * t)));
}

/**
 * Mede a frequência de batimento num sinal amostrado, sem saber f₁ e f₂: a
 * envoltória é o máximo de |s| numa janela de um período da portadora; os
 * mínimos dela marcam cada batida. Devolve batidas por segundo.
 */
export function measureBeatFrequency(samples: Float32Array | number[], sampleRate: number, carrier: number): number {
  const window = Math.max(1, Math.round(sampleRate / carrier));
  const env: number[] = [];
  for (let i = 0; i + window <= samples.length; i += window) {
    let max = 0;
    for (let j = i; j < i + window; j += 1) max = Math.max(max, Math.abs(samples[j]!));
    env.push(max);
  }
  const mean = env.reduce((a, b) => a + b, 0) / env.length;
  // Cada descida da envoltória abaixo da média é uma batida.
  const crossings: number[] = [];
  for (let i = 1; i < env.length; i += 1) {
    if (env[i - 1]! >= mean && env[i]! < mean) {
      const f = (env[i - 1]! - mean) / (env[i - 1]! - env[i]!);
      crossings.push((i - 1 + f) * window);
    }
  }
  if (crossings.length < 2) return 0;
  const span = crossings.at(-1)! - crossings[0]!;
  return ((crossings.length - 1) * sampleRate) / span;
}

/** Harmônicos de uma forma de onda (série de Fourier), com amplitude relativa. */
export function harmonics(waveform: Waveform, fundamental: number, count: number): { frequency: number; amplitude: number }[] {
  const list: { frequency: number; amplitude: number }[] = [];
  for (let n = 1; n <= count; n += 1) {
    let amplitude = 0;
    switch (waveform) {
      case 'sine':
        amplitude = n === 1 ? 1 : 0;
        break;
      case 'square':
        amplitude = n % 2 === 1 ? 4 / (Math.PI * n) : 0;
        break;
      case 'sawtooth':
        amplitude = 2 / (Math.PI * n);
        break;
      case 'triangle':
        amplitude = n % 2 === 1 ? 8 / (Math.PI * Math.PI * n * n) : 0;
        break;
    }
    if (amplitude > 0) list.push({ frequency: n * fundamental, amplitude });
  }
  return list;
}

/**
 * Pares de harmônicos (p·f₁, q·f₂) que ficam a menos de `within` Hz um do
 * outro: são eles que batem num intervalo desafinado. O mais grave primeiro.
 */
export function harmonicBeats(
  voice1: Voice,
  voice2: Voice,
  maxHarmonic = 8,
  within = 25,
): { p: number; q: number; beat: number; strength: number }[] {
  const h1 = harmonics(voice1.waveform, voice1.frequency, maxHarmonic);
  const h2 = harmonics(voice2.waveform, voice2.frequency, maxHarmonic);
  const pairs: { p: number; q: number; beat: number; strength: number }[] = [];
  for (const a of h1) {
    for (const b of h2) {
      const beat = Math.abs(a.frequency - b.frequency);
      if (beat < within) {
        pairs.push({
          p: Math.round(a.frequency / voice1.frequency),
          q: Math.round(b.frequency / voice2.frequency),
          beat,
          strength: Math.min(a.amplitude * voice1.amplitude, b.amplitude * voice2.amplitude),
        });
      }
    }
  }
  return pairs.sort((x, y) => x.p - y.p);
}

/** Frequência temperada a `semitones` semitons do lá de 440 Hz. */
export function equalTempered(semitones: number, reference = 440): number {
  return reference * 2 ** (semitones / 12);
}

/** Intervalos: razão justa (pura) e número de semitons na escala temperada. */
export const INTERVALS = {
  unison: { semitones: 0, just: 1 },
  third: { semitones: 4, just: 5 / 4 },
  fourth: { semitones: 5, just: 4 / 3 },
  fifth: { semitones: 7, just: 3 / 2 },
  octave: { semitones: 12, just: 2 },
} as const;

export type IntervalName = keyof typeof INTERVALS;

/** Ângulos dos fasores no referencial da frequência média, rad: ±π(f₁ − f₂)t. */
export function phasorAngles(f1: number, f2: number, t: number): { first: number; second: number } {
  const half = Math.PI * (f1 - f2) * t;
  return { first: half, second: -half };
}
