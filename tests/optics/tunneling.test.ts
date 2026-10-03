import { describe, expect, it } from 'vitest';
import {
  type BarrierWave,
  abs2,
  approximateTransmission,
  barrierWave,
  decayConstant,
  deBroglie,
  transmission,
  tunnelingCurrent,
  waveAt,
  waveNumber,
} from '../../src/optics/quantum/tunneling';

/** Tunelamento por barreira retangular (ADR 0011). */

const nm = 1e-9;

describe('números de onda', () => {
  it('κ para V₀ − E = 1 eV é 5,123 nm⁻¹', () => {
    // κ = √(2mₑ·1 eV)/ħ
    expect(decayConstant(1, 2) * nm).toBeCloseTo(5.1231, 3);
  });

  it('um elétron de 1 eV tem λ = 1,226 nm', () => {
    expect(deBroglie(1) / nm).toBeCloseTo(1.2264, 3);
  });
});

describe('transmissão', () => {
  it('E = 1 eV, V₀ = 2 eV, a = 0,4 nm: T = 6,42%', () => {
    // κa = 2,0492; senh² = 14,566; V₀²/(4E(V₀ − E)) = 1
    expect(transmission(1, 2, 0.4 * nm)).toBeCloseTo(0.06424, 4);
  });

  it('cai exponencialmente com a largura', () => {
    const t1 = transmission(1, 3, 0.6 * nm);
    const t2 = transmission(1, 3, 0.8 * nm);
    // Razão ≈ e^{−2κ·0,2 nm} para barreira larga.
    expect(t2 / t1).toBeCloseTo(Math.exp(-2 * decayConstant(1, 3) * 0.2 * nm), 2);
  });

  it('a aproximação de barreira larga converge para o exato', () => {
    const exact = transmission(1, 3, 1.2 * nm);
    expect(approximateTransmission(1, 3, 1.2 * nm) / exact).toBeCloseTo(1, 3);
  });

  it('sem barreira, tudo passa; acima dela, há ressonâncias com T = 1', () => {
    expect(transmission(1, 2, 0)).toBe(1);
    // E > V₀: T = 1 quando K·a = nπ.
    const E = 1;
    const V = 0.5;
    const width = Math.PI / waveNumber(E - V);
    expect(transmission(E, V, width)).toBeCloseTo(1, 10);
    expect(transmission(E, V, width / 2)).toBeLessThan(1);
  });

  it('a corrente de tunelamento é a fração T do feixe', () => {
    expect(tunnelingCurrent(10e-9, 1, 2, 0.4 * nm)).toBeCloseTo(10e-9 * transmission(1, 2, 0.4 * nm), 15);
  });
});

describe('função de onda', () => {
  const cases: [number, number, number][] = [
    [1, 2, 0.4 * nm],
    [1, 4, 0.9 * nm],
    [1, 0.6, 0.5 * nm],
  ];

  it('conserva a probabilidade: |r|² + |τ|² = 1', () => {
    for (const [E, V, a] of cases) {
      const wave = barrierWave(E, V, a);
      expect(abs2(wave.r) + abs2(wave.tau)).toBeCloseTo(1, 10);
      expect(wave.transmission).toBeCloseTo(transmission(E, V, a), 10);
    }
  });

  it('ψ e ψ′ são contínuas nas duas paredes', () => {
    const h = 1e-15;
    const derivative = (wave: BarrierWave, x: number, side: -1 | 1): { re: number; im: number } => {
      const a = waveAt(wave, x + side * h);
      const b = waveAt(wave, x + side * 2 * h);
      return { re: ((b.re - a.re) / h) * side, im: ((b.im - a.im) / h) * side };
    };
    for (const [E, V, a] of cases) {
      const wave = barrierWave(E, V, a);
      for (const x of [0, a]) {
        const left = waveAt(wave, x - 1e-18);
        const right = waveAt(wave, x + 1e-18);
        expect(Math.hypot(left.re - right.re, left.im - right.im)).toBeLessThan(1e-6);
        const dl = derivative(wave, x, -1);
        const dr = derivative(wave, x, 1);
        // Derivadas relativas ao número de onda: contínuas a 0,1%.
        const scale = wave.k;
        expect(Math.hypot(dl.re - dr.re, dl.im - dr.im) / scale).toBeLessThan(2e-3);
      }
    }
  });

  it('dentro da barreira a amplitude decai', () => {
    const wave = barrierWave(1, 3, 0.8 * nm);
    const start = abs2(waveAt(wave, 0.05 * nm));
    const middle = abs2(waveAt(wave, 0.4 * nm));
    expect(middle).toBeLessThan(start * 0.2);
  });
});
