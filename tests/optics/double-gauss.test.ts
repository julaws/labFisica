import { describe, expect, it } from 'vitest';
import { WAVELENGTHS_NM } from '../../src/optics/constants';
import { analyze } from '../../src/optics/paraxial';
import { axialCrossing, collimatedRay, sphericalAberration, traceRay } from '../../src/optics/trace';
import { glassElements, opticalLength, vertexPositions } from '../../src/optics/prescription';
import { abbeNumber, indexD } from '../../src/optics/glass';
import { widestFNumber, withFNumber } from '../../src/optics/aperture';
import {
  BAKER_F_NUMBER,
  BAKER_PATENT_TABLE,
  LENS_50MM_F2,
  MIN_EDGE_MM,
  bakerScale,
} from '../../src/optics/prescriptions/baker-double-gauss';

/**
 * Objetiva do experimento 1: Gauss duplo da patente US 2.532.751, Exemplo 1
 * (ADR 0005). Os testes checam que a tabela transcrita continua sendo a da
 * patente e que a lente resultante se comporta como um Gauss duplo f/2.
 */

const lens = LENS_50MM_F2;
const lastVertex = vertexPositions(lens.surfaces).at(-1)!;

describe('Gauss duplo da patente US 2.532.751', () => {
  it('dá EFL de 50,000 mm', () => {
    expect(analyze(lens).efl).toBeCloseTo(50, 6);
  });

  it('com os vidros do catálogo, a EFL da tabela fica a menos de 1% do F = 1,000 da patente', () => {
    // Fator de escala = 50 / EFL(F=1); perto de 50 quer dizer que a troca de
    // vidros pelos equivalentes SCHOTT quase não mexeu na potência.
    expect(Math.abs(bakerScale() / 50 - 1)).toBeLessThan(0.01);
  });

  it('preserva as proporções da patente: raios e espessuras escalam pelo mesmo fator', () => {
    const k = bakerScale();
    lens.surfaces.forEach((surface, index) => {
      const row = BAKER_PATENT_TABLE[index]!;
      expect(surface.thickness).toBeCloseTo(row.thickness * k, 9);
      if (typeof row.radius === 'number' && Number.isFinite(row.radius)) {
        expect(surface.radius).toBeCloseTo(row.radius * k, 9);
      }
    });
  });

  it('tem seis elementos de vidro e onze superfícies, com o diafragma no meio de S₂', () => {
    expect(glassElements(lens.surfaces)).toHaveLength(6);
    expect(lens.surfaces).toHaveLength(11);
    const stop = lens.surfaces.findIndex((s) => s.isStop);
    expect(stop).toBe(5);
    expect(lens.surfaces[4]!.thickness).toBeCloseTo(lens.surfaces[5]!.thickness, 9);
  });

  it('usa vidros de catálogo próximos dos (n_d, ν) declarados na patente', () => {
    const declared: [number, number][] = [
      [1.617, 55.0],
      [1.611, 57.2],
      [1.605, 38.0],
      [1.605, 38.0],
      [1.62, 60.3],
      [1.62, 60.3],
    ];
    glassElements(lens.surfaces).forEach((element, i) => {
      const [nd, vd] = declared[i]!;
      expect(Math.abs(indexD(element.material) - nd)).toBeLessThan(0.006);
      expect(Math.abs(abbeNumber(element.material) - vd)).toBeLessThan(2);
    });
  });

  it('abre exatamente em f/2, a abertura nominal da patente', () => {
    expect(widestFNumber(lens)).toBeCloseTo(BAKER_F_NUMBER, 6);
  });

  it('deixa passar o feixe inteiro de f/2 no eixo', () => {
    const radius = 50 / BAKER_F_NUMBER / 2;
    for (const fraction of [0.25, 0.5, 0.75, 0.999]) {
      expect(traceRay(lens, collimatedRay(radius * fraction)).blocked).toBeNull();
    }
  });

  it('tem borda de vidro com pelo menos 0,5 mm em todos os elementos', () => {
    const s = lens.surfaces;
    const sag = (radius: number, h: number): number =>
      Number.isFinite(radius) ? radius - Math.sign(radius) * Math.sqrt(radius * radius - h * h) : 0;
    for (let i = 0; i < s.length - 1; i += 1) {
      if (s[i]!.material.name === 'ar') continue;
      const h = Math.max(s[i]!.semiDiameter, s[i + 1]!.semiDiameter);
      // Superfície mais estreita que o elemento termina num ressalto plano.
      const hFront = Math.min(h, s[i]!.semiDiameter);
      const hBack = Math.min(h, s[i + 1]!.semiDiameter);
      const edge = s[i]!.thickness - sag(s[i]!.radius, hFront) + sag(s[i + 1]!.radius, hBack);
      expect(edge).toBeGreaterThanOrEqual(MIN_EDGE_MM - 1e-6);
    }
  });

  it('cabe num barril de 50 mm: conjunto de 30 a 45 mm, foco traseiro positivo', () => {
    const length = opticalLength(lens.surfaces);
    expect(length).toBeGreaterThan(30);
    expect(length).toBeLessThan(45);
    expect(analyze(lens).bfl).toBeGreaterThan(20);
  });

  it('concorda com o paraxial: o raio quase axial cruza o eixo no foco traseiro', () => {
    const { bfl } = analyze(lens);
    const crossing = axialCrossing(traceRay(lens, collimatedRay(1e-3)).exit!) - lastVertex;
    expect(Math.abs(crossing - bfl)).toBeLessThan(0.01);
  });

  it('é um Gauss duplo bem corrigido: aberração esférica em f/2 abaixo de 0,5 mm', () => {
    // O par de dubletos tinha −1,9 mm; seis elementos corrigem bem mais.
    const sa = sphericalAberration(lens, 50 / 4);
    expect(Math.abs(sa.longitudinal)).toBeLessThan(0.5);
  });

  it('é acromática: F e C focam a menos de 0,1 mm um do outro', () => {
    const focusAt = (wavelength: number): number =>
      axialCrossing(traceRay(lens, collimatedRay(5), wavelength).exit!);
    expect(Math.abs(focusAt(WAVELENGTHS_NM.F) - focusAt(WAVELENGTHS_NM.C))).toBeLessThan(0.1);
  });

  it('ajusta o stop para dar a pupila de entrada f/N', () => {
    for (const fNumber of [2, 5.6, 16]) {
      const { efl, entrancePupil } = analyze(withFNumber(lens, fNumber));
      expect(entrancePupil.diameter).toBeCloseTo(efl / fNumber, 6);
    }
  });

  it('declara a patente como fonte (SPEC §13)', () => {
    expect(lens.source).toContain('2.532.751');
    expect(lens.source).toContain('refractiveindex.info');
  });
});
