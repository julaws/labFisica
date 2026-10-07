import { describe, expect, it } from 'vitest';
import {
  CIRCLE_PLATE,
  SQUARE_PLATE,
  amplitude,
  besselJ,
  besselZeros,
  circleShape,
  nodalLineCount,
  plateField,
  plateModes,
  plateResponse,
  plateStiffness,
  scatterSand,
  seededRandom,
  squareModeFrequency,
  squareShape,
  stepSand,
} from '../../src/optics/acoustics/chladni';

/** Figuras de Chladni (ADR 0018). */

const L = SQUARE_PLATE.size;

describe('Bessel', () => {
  it('valores tabelados de J₀ e J₁', () => {
    expect(besselJ(0, 1)).toBeCloseTo(0.7651976866, 9);
    expect(besselJ(1, 1)).toBeCloseTo(0.4400505857, 9);
    expect(besselJ(3, 10)).toBeCloseTo(0.0583793793, 9);
  });

  it('zeros tabelados: j₀,₁ = 2,4048, j₁,₁ = 3,8317, j₂,₁ = 5,1356, j₀,₂ = 5,5201', () => {
    expect(besselZeros(0, 2)[0]).toBeCloseTo(2.404825558, 7);
    expect(besselZeros(0, 2)[1]).toBeCloseTo(5.520078110, 7);
    expect(besselZeros(1, 1)[0]).toBeCloseTo(3.831705970, 7);
    expect(besselZeros(2, 1)[0]).toBeCloseTo(5.135622302, 7);
  });
});

describe('placa quadrada', () => {
  it('(n, m) e (m, n) são o mesmo desenho: só o sinal muda', () => {
    for (const [x, y] of [
      [0.03, -0.07],
      [-0.1, 0.05],
      [0.11, 0.02],
    ] as const) {
      expect(squareShape(2, 5, x, y, L)).toBeCloseTo(-squareShape(5, 2, x, y, L), 12);
      // Trocar x e y também só troca o sinal.
      expect(squareShape(2, 5, y, x, L)).toBeCloseTo(-squareShape(2, 5, x, y, L), 12);
    }
  });

  it('a diagonal principal é sempre nodal; com n + m par, a outra também', () => {
    for (let i = -10; i <= 10; i += 1) {
      const t = (i / 10) * (L / 2);
      expect(squareShape(1, 2, t, t, L)).toBeCloseTo(0, 12);
      expect(squareShape(1, 3, t, t, L)).toBeCloseTo(0, 12);
      expect(squareShape(1, 3, t, -t, L)).toBeCloseTo(0, 12);
    }
    // (1, 2), com n + m ímpar, não zera na outra diagonal.
    expect(Math.abs(squareShape(1, 2, 0.3 * L, -0.3 * L, L))).toBeGreaterThan(0.1);
  });

  it('é autofunção: ∇²u = −k²u, com k² = (π/L)²(n² + m²)', () => {
    const [n, m] = [2, 5];
    const k2 = (Math.PI / L) ** 2 * (n * n + m * m);
    const h = 1e-4;
    for (const [x, y] of [
      [0.02, 0.05],
      [-0.08, 0.01],
    ] as const) {
      const lap =
        (squareShape(n, m, x + h, y, L) +
          squareShape(n, m, x - h, y, L) +
          squareShape(n, m, x, y + h, L) +
          squareShape(n, m, x, y - h, L) -
          4 * squareShape(n, m, x, y, L)) /
        (h * h);
      expect(lap / (-k2 * squareShape(n, m, x, y, L))).toBeCloseTo(1, 4);
    }
  });

  it('a borda é livre de inclinação (∂u/∂n = 0)', () => {
    // Diferença central na borda: a função continua par através dela.
    const h = 1e-5;
    const edge = L / 2;
    const slope = (squareShape(3, 4, edge + h, 0.03, L) - squareShape(3, 4, edge - h, 0.03, L)) / (2 * h);
    expect(Math.abs(slope)).toBeLessThan(1e-6);
  });

  it('frequências da placa de aço de 24 cm e 0,8 mm: 33,2·(n² + m²) Hz', () => {
    expect(plateStiffness(SQUARE_PLATE)).toBeCloseTo(1.218, 3);
    expect(squareModeFrequency(SQUARE_PLATE, 1, 2)).toBeCloseTo(166.08, 1);
    expect(squareModeFrequency(SQUARE_PLATE, 2, 1)).toBeCloseTo(squareModeFrequency(SQUARE_PLATE, 1, 2), 9);
  });

  it('linhas nodais que chegam à borda: (0, 1) uma diagonal, (0, 2) as duas', () => {
    const modes = plateModes(SQUARE_PLATE, 4000);
    const find = (n: number, m: number) => modes.find((mode) => mode.n === n && mode.m === m)!;
    expect(nodalLineCount(find(0, 1), L)).toBe(1);
    expect(nodalLineCount(find(0, 2), L)).toBe(2);
  });

  it('os modos vêm em ordem de frequência, sem n = m', () => {
    const modes = plateModes(SQUARE_PLATE, 3000);
    expect(modes.length).toBeGreaterThan(20);
    for (let i = 1; i < modes.length; i += 1) expect(modes[i]!.frequency).toBeGreaterThanOrEqual(modes[i - 1]!.frequency);
    expect(modes.every((mode) => mode.n !== mode.m)).toBe(true);
  });
});

describe('placa circular', () => {
  it('a borda é nodal e os diâmetros nodais ficam em cos(nθ) = 0', () => {
    const modes = plateModes(CIRCLE_PLATE, 4000);
    const mode = modes.find((m) => m.n === 2 && m.m === 2)!;
    const a = CIRCLE_PLATE.size;
    expect(circleShape(2, mode.k, a * Math.cos(0.3), a * Math.sin(0.3), a)).toBeCloseTo(0, 3);
    const r = a * 0.4;
    expect(circleShape(2, mode.k, r * Math.cos(Math.PI / 4), r * Math.sin(Math.PI / 4), a)).toBeCloseTo(0, 9);
    expect(nodalLineCount(mode, a)).toBe(3);
  });
});

describe('resposta forçada', () => {
  const modes = plateModes(SQUARE_PLATE, 4000);

  it('na frequência de um modo, ele domina com amplitude 1', () => {
    const target = modes.find((m) => m.n === 1 && m.m === 3)!;
    const response = plateResponse(modes, target.frequency);
    expect(response.dominant).toBe(target);
    expect(response.strength).toBeCloseTo(1, 6);
    expect(response.resonant).toBe(true);
  });

  it('entre duas ressonâncias, nenhum modo domina e a placa quase não se mexe', () => {
    const a = modes.find((m) => m.n === 1 && m.m === 3)!;
    const b = modes.find((m) => m.n === 2 && m.m === 3)!;
    const response = plateResponse(modes, Math.sqrt(a.frequency * b.frequency));
    expect(response.resonant).toBe(false);
    expect(response.strength).toBeLessThan(0.1);
  });
});

describe('areia', () => {
  it('depois de estabilizar, a areia fica onde |u| é pequeno', () => {
    const modes = plateModes(SQUARE_PLATE, 4000);
    const mode = modes.find((m) => m.n === 1 && m.m === 3)!;
    const response = plateResponse(modes, mode.frequency);
    const exact = (x: number, y: number): number => amplitude(response, x, y, L);
    const field = plateField(response, SQUARE_PLATE);
    const at = field.amplitudeAt;
    // A grade reproduz a soma dos modos.
    expect(at(0.031, -0.047)).toBeCloseTo(exact(0.031, -0.047), 2);
    const random = seededRandom(7);
    const sand = scatterSand(4000, SQUARE_PLATE, random);
    const mean = (positions: Float32Array): number => {
      let sum = 0;
      for (let i = 0; i < positions.length; i += 2) sum += at(positions[i]!, positions[i + 1]!);
      return sum / (positions.length / 2);
    };
    const before = mean(sand);
    for (let step = 0; step < 600; step += 1) stepSand(sand, at, SQUARE_PLATE, random);
    const after = mean(sand);
    expect(after).toBeLessThan(before * 0.3);
    // Mais de três quartos dos grãos em |u| abaixo de 0,15 (o limiar é 0,1).
    let near = 0;
    for (let i = 0; i < sand.length; i += 2) if (at(sand[i]!, sand[i + 1]!) < 0.15) near += 1;
    expect(near / 4000).toBeGreaterThan(0.75);
  });

  it('nenhum grão sai da placa', () => {
    const modes = plateModes(CIRCLE_PLATE, 4000);
    const response = plateResponse(modes, modes[3]!.frequency);
    const random = seededRandom(3);
    const sand = scatterSand(2000, CIRCLE_PLATE, random);
    const field = plateField(response, CIRCLE_PLATE);
    for (let step = 0; step < 100; step += 1) stepSand(sand, field.amplitudeAt, CIRCLE_PLATE, random);
    for (let i = 0; i < sand.length; i += 2) {
      expect(Math.hypot(sand[i]!, sand[i + 1]!)).toBeLessThanOrEqual(CIRCLE_PLATE.size + 1e-9);
    }
  });
});
