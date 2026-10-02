import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DOUBLE_SLIT,
  type DoubleSlitGeometry,
  countMaxima,
  electronSpeedFraction,
  electronWavelength,
  fresnelIntegrals,
  fringeSpacing,
  sampleFromPattern,
  screenIntensity,
} from '../../src/optics/waves/double-slit';

/** Dupla fenda com elétrons (ADR 0009). */

const lambda = electronWavelength(DEFAULT_DOUBLE_SLIT.voltage);
const geometry: DoubleSlitGeometry = {
  wavelength: lambda,
  slitWidth: DEFAULT_DOUBLE_SLIT.slitWidth,
  separation: DEFAULT_DOUBLE_SLIT.separation,
  distance: DEFAULT_DOUBLE_SLIT.distance,
};

const grid = (half: number, count: number): Float64Array => {
  const out = new Float64Array(count);
  for (let i = 0; i < count; i += 1) out[i] = -half + (2 * half * i) / (count - 1);
  return out;
};

/** Máximos locais acima de uma fração do maior valor. */
const peaks = (xs: Float64Array, ys: Float64Array, fraction: number): number[] => {
  const max = Math.max(...ys);
  const out: number[] = [];
  for (let i = 1; i < ys.length - 1; i += 1) {
    if (ys[i]! > ys[i - 1]! && ys[i]! >= ys[i + 1]! && ys[i]! > fraction * max) out.push(xs[i]!);
  }
  return out;
};

describe('comprimento de onda do elétron', () => {
  it('vale 5,355 pm a 50 kV, com a correção relativística', () => {
    expect(lambda * 1e12).toBeCloseTo(5.3553, 3);
  });

  it('a 100 V a correção é desprezível: λ ≈ 1,226/√V nm', () => {
    expect(electronWavelength(100) * 1e9).toBeCloseTo(1.226 / Math.sqrt(100), 3);
  });
});

describe('integrais de Fresnel', () => {
  it('batem com os valores tabelados', () => {
    // Abramowitz e Stegun, tabela 7.7.
    expect(fresnelIntegrals(1).c).toBeCloseTo(0.7798934, 5);
    expect(fresnelIntegrals(1).s).toBeCloseTo(0.4382591, 5);
    expect(fresnelIntegrals(2).c).toBeCloseTo(0.4882534, 5);
    expect(fresnelIntegrals(2).s).toBeCloseTo(0.3434157, 5);
  });

  it('tendem a 1/2 no infinito e são ímpares', () => {
    // Oscilam em volta de 1/2 com amplitude 1/(πx).
    for (const x of [60, 500]) {
      expect(Math.abs(fresnelIntegrals(x).c - 0.5)).toBeLessThanOrEqual(1 / (Math.PI * x) + 1e-9);
      expect(Math.abs(fresnelIntegrals(x).s - 0.5)).toBeLessThanOrEqual(1 / (Math.PI * x) + 1e-9);
    }
    expect(fresnelIntegrals(-1.3).c).toBeCloseTo(-fresnelIntegrals(1.3).c, 12);
  });

  it('a assintótica emenda com a tabela em x = 8', () => {
    const below = fresnelIntegrals(7.9999);
    const above = fresnelIntegrals(8.0001);
    expect(Math.abs(below.c - above.c)).toBeLessThan(2e-4);
    expect(Math.abs(below.s - above.s)).toBeLessThan(2e-4);
  });
});

describe('padrão no anteparo', () => {
  const xs = grid(16e-6, 801);

  it('sem detector, as franjas têm o espaçamento λL/d no limite de Fraunhofer', () => {
    // Fendas estreitas e anteparo longe: regime de Fraunhofer.
    const far: DoubleSlitGeometry = { ...geometry, slitWidth: 0.2e-6, separation: 2e-6, distance: 1.4 };
    const wide = grid(4e-6, 2001);
    const intensity = screenIntensity(far, { left: true, right: true, detectors: false }, wide);
    const p = peaks(wide, intensity, 0.5).sort((a, b) => Math.abs(a) - Math.abs(b));
    const spacing = Math.abs(p[1]! - p[0]!);
    expect(spacing / fringeSpacing(far)).toBeCloseTo(1, 2);
  });

  it('uma fenda só, longe: o primeiro zero cai em λL/a', () => {
    const far: DoubleSlitGeometry = { ...geometry, slitWidth: 0.5e-6, distance: 1.4 };
    const wide = grid(40e-6, 4001);
    const intensity = screenIntensity(far, { left: false, right: true, detectors: false }, wide);
    const center = far.separation / 2;
    const zero = (far.wavelength * far.distance) / far.slitWidth;
    // Mínimo entre o centro e 1,5 zero.
    let best = Infinity;
    let at = 0;
    for (let i = 0; i < wide.length; i += 1) {
      const offset = wide[i]! - center;
      if (offset > 0.5 * zero && offset < 1.5 * zero && intensity[i]! < best) {
        best = intensity[i]!;
        at = offset;
      }
    }
    expect(at / zero).toBeCloseTo(1, 1);
  });

  it('com detector, é a soma das duas fendas sozinhas', () => {
    const both = screenIntensity(geometry, { left: true, right: true, detectors: true }, xs);
    const left = screenIntensity(geometry, { left: true, right: false, detectors: false }, xs);
    const right = screenIntensity(geometry, { left: false, right: true, detectors: false }, xs);
    for (let i = 0; i < xs.length; i += 1) expect(both[i]).toBeCloseTo(left[i]! + right[i]!, 12);
  });

  it('o detector não cria nem destrói elétrons: a interferência só redistribui', () => {
    const wide = grid(200e-6, 8001);
    const coherent = screenIntensity(geometry, { left: true, right: true, detectors: false }, wide);
    const incoherent = screenIntensity(geometry, { left: true, right: true, detectors: true }, wide);
    const sum = (a: Float64Array): number => a.reduce((s, v) => s + v, 0);
    expect(sum(coherent) / sum(incoherent)).toBeCloseTo(1, 2);
  });

  it('na geometria padrão: duas faixas com o detector, muitas franjas sem ele', () => {
    const detectorOn = screenIntensity(geometry, { left: true, right: true, detectors: true }, xs);
    const twoBands = peaks(xs, detectorOn, 0.5);
    expect(twoBands).toHaveLength(2);
    expect(Math.abs(Math.abs(twoBands[0]!) - geometry.separation / 2)).toBeLessThan(1e-6);
    // O meio entre as faixas fica bem mais escuro.
    const middle = detectorOn[(xs.length - 1) / 2]!;
    expect(middle / Math.max(...detectorOn)).toBeLessThan(0.5);

    const detectorOff = screenIntensity(geometry, { left: true, right: true, detectors: false }, xs);
    expect(peaks(xs, detectorOff, 0.15).length).toBeGreaterThanOrEqual(9);
  });

  it('é simétrico com as duas fendas abertas', () => {
    const intensity = screenIntensity(geometry, { left: true, right: true, detectors: false }, xs);
    for (let i = 0; i < xs.length; i += 1) {
      expect(intensity[i]).toBeCloseTo(intensity[xs.length - 1 - i]!, 10);
    }
  });

  it('as duas fendas tampadas não deixam passar nada', () => {
    const intensity = screenIntensity(geometry, { left: false, right: false, detectors: false }, xs);
    expect(Math.max(...intensity)).toBe(0);
  });
});

describe('sorteio dos impactos', () => {
  it('cai onde a intensidade está', () => {
    const xs = grid(1, 3);
    expect(sampleFromPattern(xs, [0, 1, 0], 0.5)).toBe(0);
    expect(sampleFromPattern(xs, [1, 0, 1], 0.25)).toBe(-1);
    expect(sampleFromPattern(xs, [1, 0, 1], 0.75)).toBe(1);
    expect(Number.isNaN(sampleFromPattern(xs, [0, 0, 0], 0.5))).toBe(true);
  });
});

describe('auxiliares', () => {
  it('a 50 kV o elétron anda a 41,3% da luz', () => {
    // γ = 1 + 50/510,999 → v/c = √(1 − 1/γ²)
    expect(electronSpeedFraction(50_000)).toBeCloseTo(0.4127, 4);
  });

  it('conta máximos acima do limiar', () => {
    expect(countMaxima([0, 1, 0, 0.5, 0, 0.1, 0])).toBe(2);
    expect(countMaxima([0, 1, 0, 0.5, 0, 0.1, 0], 0.05)).toBe(3);
    expect(countMaxima([0, 0, 0])).toBe(0);
  });
});
