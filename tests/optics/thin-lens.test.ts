import { describe, expect, it } from 'vitest';
import {
  blurDiameter,
  convergence,
  dofLimits,
  focusExtension,
  hyperfocal,
  imageDistance,
  magnification,
  pupilDiameter,
} from '../../src/optics/thin-lens';

const f = 50;
const C_REF = 0.036;
const C_STRICT = 0.03;

/** Tolerância relativa padrão da SPEC §5.6: 0,5%. */
function expectRel(actual: number, expected: number, rel = 0.005): void {
  expect(Math.abs(actual - expected) / Math.abs(expected)).toBeLessThanOrEqual(rel);
}

describe('distância da imagem (SPEC §5.6)', () => {
  it('foco em 600 mm dá v = 54,545 mm e extensão 4,545 mm', () => {
    expectRel(imageDistance(f, 600), 54.545);
    expectRel(focusExtension(f, 600), 4.545);
  });

  it('foco em 370 mm dá v = 57,812 mm e extensão 7,812 mm', () => {
    expectRel(imageDistance(f, 370), 57.812);
    expectRel(focusExtension(f, 370), 7.812);
  });

  it('foco em 2000 mm dá v = 51,282 mm', () => {
    expectRel(imageDistance(f, 2000), 51.282);
  });

  it('objeto no infinito foca no plano focal', () => {
    expect(imageDistance(f, Infinity)).toBe(f);
    expect(focusExtension(f, Infinity)).toBe(0);
  });

  it('objeto sobre o foco manda os raios para o infinito', () => {
    expect(imageDistance(f, f)).toBe(Infinity);
  });

  it('objeto mais perto que f dá imagem virtual, com v negativo', () => {
    expect(imageDistance(f, 25)).toBeLessThan(0);
  });

  it('a imagem real é invertida e menor a 600 mm', () => {
    const m = magnification(f, 600);
    expect(m).toBeLessThan(0);
    expectRel(Math.abs(m), 54.545 / 600);
  });
});

describe('pupila e hiperfocal', () => {
  it('usa D = f/N', () => {
    expect(pupilDiameter(f, 2)).toBe(25);
    expect(pupilDiameter(f, 16)).toBe(3.125);
  });

  it('hiperfocal com c = 0,030 em f/2 fica perto de 41 717 mm', () => {
    expectRel(hyperfocal(f, 2, C_STRICT), 41_717);
  });
});

describe('zona nítida (SPEC §5.6)', () => {
  it('c = 0,036, s = 600, f/2 dá 19,0 mm entre 590,6 e 609,7', () => {
    const dof = dofLimits(f, 2, C_REF, 600);
    expectRel(dof.near, 590.6);
    expectRel(dof.far, 609.7);
    expectRel(dof.total, 19.0);
  });

  it('c = 0,036, s = 370, f/2 dá 6,8 mm entre 366,6 e 373,4', () => {
    const dof = dofLimits(f, 2, C_REF, 370);
    expectRel(dof.near, 366.6);
    expectRel(dof.far, 373.4);
    expectRel(dof.total, 6.8);
  });

  it('c = 0,036, s = 600, f/5.6 dá 53,3 mm', () => {
    expectRel(dofLimits(f, 5.6, C_REF, 600).total, 53.3);
  });

  it('c = 0,036, s = 600, f/16 dá 154,5 mm entre 532,5 e 687,1', () => {
    const dof = dofLimits(f, 16, C_REF, 600);
    expectRel(dof.near, 532.5);
    expectRel(dof.far, 687.1);
    expectRel(dof.total, 154.5);
  });

  it('c = 0,030, s = 600, f/2 dá 15,8 mm entre 592,2 e 608,0', () => {
    const dof = dofLimits(f, 2, C_STRICT, 600);
    expectRel(dof.near, 592.2);
    expectRel(dof.far, 608.0);
    expectRel(dof.total, 15.8);
  });

  it('cruza com o site de referência: 1,9 cm a 60 cm e 0,7 cm a 37 cm', () => {
    expect((dofLimits(f, 2, C_REF, 600).total / 10).toFixed(1)).toBe('1.9');
    expect((dofLimits(f, 2, C_REF, 370).total / 10).toFixed(1)).toBe('0.7');
  });

  it('focar na hiperfocal leva o limite distante ao infinito', () => {
    const H = hyperfocal(f, 2, C_REF);
    const dof = dofLimits(f, 2, C_REF, H);
    expect(dof.far).toBe(Infinity);
    expect(dof.total).toBe(Infinity);
    expectRel(dof.near, H / 2, 0.01);
  });

  it('fechar a abertura aumenta a zona nítida de forma monotônica', () => {
    const totals = [2, 2.8, 4, 5.6, 8, 11, 16].map((N) => dofLimits(f, N, C_REF, 600).total);
    for (let i = 1; i < totals.length; i += 1) {
      expect(totals[i]!).toBeGreaterThan(totals[i - 1]!);
    }
  });
});

describe('círculo de confusão (SPEC §5.6)', () => {
  it('f/2, foco 600, objeto 370 dá 1,413 mm', () => {
    expectRel(blurDiameter(f, 2, 600, 370), 1.413);
  });

  it('f/2, foco 600, objeto 2000 dá 1,591 mm', () => {
    expectRel(blurDiameter(f, 2, 600, 2000), 1.591);
  });

  it('f/16, foco 600, objeto 370 dá 0,177 mm', () => {
    expectRel(blurDiameter(f, 16, 600, 370), 0.177);
  });

  it('o objeto no plano de foco vira um ponto', () => {
    expect(blurDiameter(f, 2, 600, 600)).toBe(0);
  });

  it('um objeto no limite da zona nítida borra exatamente c', () => {
    const limits = dofLimits(f, 2, C_REF, 600);
    expectRel(blurDiameter(f, 2, 600, limits.near), C_REF, 0.01);
    expectRel(blurDiameter(f, 2, 600, limits.far), C_REF, 0.01);
  });

  it('fechar a abertura encolhe todos os discos', () => {
    expect(blurDiameter(f, 16, 600, 370)).toBeLessThan(blurDiameter(f, 2, 600, 370));
  });

  it('com foco no infinito, o pinheiro a 37 cm vira um disco de 3,4 mm (SPEC §6.7)', () => {
    const b = blurDiameter(f, 2, Infinity, 370);
    expect(Number.isFinite(b)).toBe(true);
    expectRel(b, (f * f) / (2 * 370));
    expect(b.toFixed(1)).toBe('3.4');
  });

  it('com foco no infinito, um objeto no infinito fica nítido', () => {
    expect(blurDiameter(f, 2, Infinity, Infinity)).toBe(0);
  });

  it('o limite do foco no infinito concorda com a forma geral para s muito grande', () => {
    expectRel(blurDiameter(f, 2, 1e9, 370), blurDiameter(f, 2, Infinity, 370), 1e-4);
  });

  it('objeto no infinito tende ao valor limite f2/(N(s-f))', () => {
    expectRel(blurDiameter(f, 2, 600, Infinity), (f * f) / (2 * (600 - f)));
  });
});

describe('convergência (SPEC §5.2)', () => {
  it('o objeto em foco converge sobre o plano da imagem', () => {
    expect(convergence(f, 600, 600).side).toBe('on');
  });

  it('objeto mais perto que o foco converge atrás do sensor', () => {
    const c = convergence(f, 600, 370);
    expect(c.side).toBe('behind');
    expect(c.offset).toBeGreaterThan(0);
    expectRel(c.v, 57.812);
  });

  it('objeto mais longe que o foco converge à frente do sensor', () => {
    const c = convergence(f, 600, 2000);
    expect(c.side).toBe('front');
    expect(c.offset).toBeLessThan(0);
    expectRel(c.v, 51.282);
  });
});
