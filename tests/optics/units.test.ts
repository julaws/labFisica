import { describe, expect, it } from 'vitest';
import { clamp, cmToMm, mToMm, mmToCm, mmToM, nmToUm } from '../../src/optics/units';
import { COC_MM, DEFAULT_FOCAL_LENGTH_MM, F_STOPS, FULL_FRAME_SENSOR } from '../../src/optics/constants';

describe('unidades', () => {
  it('converte cm e m para mm', () => {
    expect(cmToMm(60)).toBe(600);
    expect(mToMm(2)).toBe(2000);
    expect(mmToCm(370)).toBe(37);
    expect(mmToM(2000)).toBe(2);
  });

  it('converte nm para µm para a equação de Sellmeier', () => {
    expect(nmToUm(587.56)).toBeCloseTo(0.58756, 6);
  });

  it('limita valores ao intervalo', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});

describe('constantes do experimento 1', () => {
  it('usa 50 mm e sensor full-frame', () => {
    expect(DEFAULT_FOCAL_LENGTH_MM).toBe(50);
    expect(FULL_FRAME_SENSOR).toEqual({ w: 36, h: 24 });
  });

  it('tem os dois círculos de confusão da SPEC §5.1', () => {
    expect(COC_MM.reference).toBe(0.036);
    expect(COC_MM.strict).toBe(0.03);
  });

  it('cobre a escala de stops completos de f/1.4 a f/22', () => {
    expect(F_STOPS[0]).toBe(1.4);
    expect(F_STOPS.at(-1)).toBe(22);
    // Cada stop dobra a área: a razão entre números f consecutivos é √2.
    for (let i = 1; i < F_STOPS.length; i += 1) {
      const ratio = F_STOPS[i]! / F_STOPS[i - 1]!;
      expect(ratio).toBeGreaterThan(1.3);
      expect(ratio).toBeLessThan(1.5);
    }
  });
});
