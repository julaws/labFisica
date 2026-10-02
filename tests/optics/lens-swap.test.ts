import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/optics/paraxial';
import { blurDiameter, imageDistance, plateBlurDiameter, plateDistance } from '../../src/optics/thin-lens';
import { widestFNumber, withFNumber } from '../../src/optics/aperture';
import { BICONCAVE_50, BICONVEX_50, DEFAULT_SINGLET } from '../../src/optics/prescriptions/singlets';
import { LENS_IDS, aberrationSpotDiameter, lensFacts } from '../../src/optics/lenses';
import { glassElements } from '../../src/optics/prescription';

/** Troca de objetiva (ADR 0007). */

describe('lentes simples', () => {
  it('a biconvexa converge com EFL de +50 mm e a bicôncava diverge com −50 mm', () => {
    expect(analyze(BICONVEX_50).efl).toBeCloseTo(50, 6);
    expect(analyze(BICONCAVE_50).efl).toBeCloseTo(-50, 6);
  });

  it('são simétricas, de um elemento só, de N-BK7', () => {
    for (const lens of [BICONVEX_50, BICONCAVE_50]) {
      const [stop, front, back] = lens.surfaces;
      expect(stop!.isStop).toBe(true);
      expect(front!.radius).toBeCloseTo(-back!.radius, 9);
      expect(glassElements(lens.surfaces)).toHaveLength(1);
      expect(front!.material.name).toBe('N-BK7');
    }
    expect(BICONVEX_50.surfaces[1]!.radius).toBeGreaterThan(0);
    expect(BICONCAVE_50.surfaces[1]!.radius).toBeLessThan(0);
  });

  it('a biconvexa guarda a borda mínima e a bicôncava o centro mínimo', () => {
    const sag = (r: number, h: number): number => Math.abs(r) - Math.sqrt(r * r - h * h);
    const h = DEFAULT_SINGLET.semiDiameter;
    const convex = BICONVEX_50.surfaces;
    const edge = convex[1]!.thickness - 2 * sag(convex[1]!.radius, h);
    expect(edge).toBeCloseTo(DEFAULT_SINGLET.minThickness, 6);
    expect(BICONCAVE_50.surfaces[1]!.thickness).toBeCloseTo(DEFAULT_SINGLET.minThickness, 9);
  });

  it('abrem em f/2, e o número f usa a focal em módulo também na divergente', () => {
    expect(widestFNumber(BICONVEX_50)).toBeCloseTo(2, 6);
    expect(widestFNumber(BICONCAVE_50)).toBeCloseTo(2, 6);
    const { entrancePupil } = analyze(withFNumber(BICONCAVE_50, 8));
    expect(entrancePupil.diameter).toBeCloseTo(50 / 8, 6);
  });
});

describe('catálogo de objetivas', () => {
  it('tem as três objetivas, todas com |EFL| = 50 mm', () => {
    expect([...LENS_IDS]).toEqual(['double-gauss', 'biconvex', 'biconcave']);
    for (const id of LENS_IDS) expect(Math.abs(lensFacts(id).efl)).toBeCloseTo(50, 6);
    expect(lensFacts('biconcave').converging).toBe(false);
    expect(lensFacts('biconvex').converging).toBe(true);
  });
});

describe('aberração esférica no melhor foco', () => {
  it('é desprezível no Gauss duplo e grande na lente simples aberta', () => {
    const coc = 0.036;
    expect(aberrationSpotDiameter('double-gauss', 2)).toBeLessThan(coc);
    expect(aberrationSpotDiameter('biconvex', 2)).toBeGreaterThan(10 * coc);
  });

  it('encolhe ao fechar o diafragma: a lente simples fica nítida a partir de f/5,6', () => {
    const spots = [2, 2.8, 4, 5.6, 8, 11, 16].map((n) => aberrationSpotDiameter('biconvex', n));
    for (let i = 1; i < spots.length; i += 1) expect(spots[i]!).toBeLessThan(spots[i - 1]!);
    expect(aberrationSpotDiameter('biconvex', 4)).toBeGreaterThan(0.036);
    expect(aberrationSpotDiameter('biconvex', 5.6)).toBeLessThan(0.036);
  });

  it('cresce com o cubo da abertura, como a aberração de terceira ordem', () => {
    // Fechar de f/8 para f/16 divide a pupila por 2 e o borrão por ~8.
    const ratio = aberrationSpotDiameter('biconvex', 8) / aberrationSpotDiameter('biconvex', 16);
    expect(ratio).toBeGreaterThan(6.5);
    expect(ratio).toBeLessThan(9.5);
  });

  it('é zero na divergente, que não forma ponto nenhum', () => {
    expect(aberrationSpotDiameter('biconcave', 2)).toBe(0);
  });
});

describe('desfoque com o sensor parado', () => {
  it('na lente convergente focada coincide com o círculo de confusão do motor', () => {
    for (const N of [2, 5.6, 16]) {
      for (const s of [370, 600, 2000]) {
        const p = plateDistance(50, s, 50);
        expect(p).toBeCloseTo(imageDistance(50, s), 9);
        for (const d of [300, 370, 600, 2000, 10_000]) {
          expect(plateBlurDiameter(50, N, p, d)).toBeCloseTo(blurDiameter(50, N, s, d), 9);
        }
      }
    }
  });

  it('na lente divergente o sensor não se mexe e todo ponto vira um disco maior que o sensor', () => {
    expect(plateDistance(-50, 600, 50)).toBe(50);
    for (const d of [370, 600, 2000]) {
      const b = plateBlurDiameter(-50, 2, 50, d);
      expect(b).toBeGreaterThan(36);
      // Imagem virtual: à frente da lente (v negativo) e menor que |f|.
      expect(imageDistance(-50, d)).toBeLessThan(0);
      expect(Math.abs(imageDistance(-50, d))).toBeLessThan(50);
    }
  });

  it('na divergente, fechar o diafragma encolhe o disco na proporção de 1/N', () => {
    const wide = plateBlurDiameter(-50, 2, 50, 600);
    const narrow = plateBlurDiameter(-50, 16, 50, 600);
    expect(wide / narrow).toBeCloseTo(8, 9);
  });
});
