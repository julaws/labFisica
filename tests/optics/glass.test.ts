import { describe, expect, it } from 'vitest';
import { AIR, GLASSES, abbeNumber, indexD, refractiveIndex } from '../../src/optics/glass';
import { WAVELENGTHS_NM } from '../../src/optics/constants';

describe('equação de Sellmeier (SPEC §5.4 e §5.6)', () => {
  it('N-BK7 em 587,56 nm dá n = 1,51680 com erro abaixo de 1e-4', () => {
    expect(refractiveIndex(GLASSES['N-BK7'], WAVELENGTHS_NM.d)).toBeCloseTo(1.5168, 4);
  });

  it('N-BK7 tem número de Abbe perto de 64,17', () => {
    expect(abbeNumber(GLASSES['N-BK7'])).toBeCloseTo(64.17, 1);
  });

  it('o ar vale exatamente 1 e não dispersa', () => {
    expect(refractiveIndex(AIR, WAVELENGTHS_NM.d)).toBe(1);
    expect(abbeNumber(AIR)).toBe(Infinity);
  });

  it('tem dispersão normal: o azul refrata mais que o vermelho', () => {
    for (const material of Object.values(GLASSES)) {
      const nF = refractiveIndex(material, WAVELENGTHS_NM.F);
      const nd = refractiveIndex(material, WAVELENGTHS_NM.d);
      const nC = refractiveIndex(material, WAVELENGTHS_NM.C);
      expect(nF).toBeGreaterThan(nd);
      expect(nd).toBeGreaterThan(nC);
    }
  });

  it('coloca os flints dispersando mais que os crowns', () => {
    expect(abbeNumber(GLASSES['N-SF2'])).toBeLessThan(abbeNumber(GLASSES['N-BK7']));
    expect(abbeNumber(GLASSES['N-SF5'])).toBeLessThan(abbeNumber(GLASSES['N-BK7']));
    expect(abbeNumber(GLASSES['N-SK16'])).toBeGreaterThan(abbeNumber(GLASSES['N-SF2']));
  });

  it('reproduz os índices nominais de catálogo na linha d', () => {
    expect(indexD(GLASSES['N-BK7'])).toBeCloseTo(1.5168, 3);
    expect(indexD(GLASSES['N-SF2'])).toBeCloseTo(1.6477, 3);
    expect(indexD(GLASSES['N-SF5'])).toBeCloseTo(1.6727, 3);
    expect(indexD(GLASSES['N-SK16'])).toBeCloseTo(1.6204, 3);
    expect(indexD(GLASSES['N-LAK22'])).toBeCloseTo(1.6511, 3);
  });

  it('exige que todo vidro do catálogo declare a sua fonte', () => {
    for (const material of Object.values(GLASSES)) {
      expect(material.source.length).toBeGreaterThan(10);
    }
  });
});
