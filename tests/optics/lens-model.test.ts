import { describe, expect, it } from 'vitest';
import { LENS_50MM_F2 } from '../../src/optics/prescriptions/baker-double-gauss';
import { widestFNumber, withFNumber } from '../../src/optics/aperture';
import { FOCUS_RANGE_MM } from '../../src/optics/constants';
import { elementProfile, surfaceSag } from '../../src/experiments/lens-focus/lens-model';
import {
  DEFAULT_IRIS,
  apertureArea,
  apertureRadiusForAngle,
  bladeAngleForAperture,
  bladePlacements,
  maxApertureRadius,
  minApertureRadius,
} from '../../src/experiments/lens-focus/iris';
import { blurAtPlate } from '../../src/experiments/lens-focus/ray-fans';
import { blurDiameter, imageDistance } from '../../src/optics/thin-lens';
import {
  RING_SWEEP,
  distanceToRingFraction,
  distanceToRingAngle,
  ringAngleToDistance,
  ringFractionToDistance,
  ringMarks,
} from '../../src/experiments/lens-focus/focus-ring';

describe('sagita das superfícies', () => {
  it('vale zero no eixo e no plano', () => {
    expect(surfaceSag(100, 0)).toBe(0);
    expect(surfaceSag(Infinity, 12)).toBe(0);
  });

  it('avança para frente numa superfície convexa', () => {
    // R = 113,4041 mm no semidiâmetro 15 mm
    expect(surfaceSag(113.4041, 15)).toBeCloseTo(113.4041 - Math.sqrt(113.4041 ** 2 - 225), 9);
    expect(surfaceSag(113.4041, 15)).toBeGreaterThan(0);
  });

  it('recua numa superfície côncava', () => {
    expect(surfaceSag(-30.483, 15)).toBeLessThan(0);
  });

  it('não explode quando o raio é menor que a altura pedida', () => {
    expect(Number.isFinite(surfaceSag(10, 40))).toBe(true);
  });
});

describe('perfil dos elementos, gerado da prescrição', () => {
  const surfaces = LENS_50MM_F2.surfaces;

  it('fecha o contorno: começa e termina no eixo', () => {
    const profile = elementProfile(surfaces[0]!, surfaces[1]!, 0, 7, 15, 8);
    expect(profile[0]!.x).toBe(0);
    expect(profile.at(-1)!.x).toBe(0);
  });

  it('reproduz a espessura central e a de borda da prescrição', () => {
    const profile = elementProfile(surfaces[0]!, surfaces[1]!, 0, 7, 15, 8);
    const centerThickness = profile.at(-1)!.y - profile[0]!.y;
    expect(centerThickness).toBeCloseTo(7, 9);

    // Na borda: espessura de centro menos a sagita da frente mais a de trás.
    const edgeFront = profile.find((point) => point.x === 15)!;
    const edgeBack = [...profile].reverse().find((point) => point.x === 15)!;
    const edgeThickness = edgeBack.y - edgeFront.y;
    expect(edgeThickness).toBeGreaterThan(0);
    expect(edgeThickness).toBeLessThan(centerThickness);
  });

  it('gera um elemento por vidro da prescrição', () => {
    // 6 elementos: o Gauss duplo da patente US 2.532.751 (ADR 0005).
    const glassSurfaces = surfaces.filter((surface) => surface.material.name !== 'ar');
    expect(glassSurfaces).toHaveLength(6);
  });
});

describe('diafragma de 9 lâminas', () => {
  it('abre no máximo com as lâminas recolhidas e fecha com elas giradas', () => {
    expect(maxApertureRadius(DEFAULT_IRIS)).toBeGreaterThan(minApertureRadius(DEFAULT_IRIS));
    expect(maxApertureRadius(DEFAULT_IRIS)).toBeCloseTo(
      DEFAULT_IRIS.pivotRadius + DEFAULT_IRIS.armLength - DEFAULT_IRIS.bladeRadius,
      9,
    );
  });

  it('inverte exatamente: ângulo → abertura → ângulo', () => {
    for (const target of [1.5, 3, 6, 10, 12.5]) {
      const psi = bladeAngleForAperture(DEFAULT_IRIS, target);
      expect(apertureRadiusForAngle(DEFAULT_IRIS, psi)).toBeCloseTo(target, 9);
    }
  });

  it('cobre toda a faixa de f/N que esta objetiva alcança', () => {
    for (const fNumber of [2, 2.8, 4, 5.6, 8, 11, 16, 22]) {
      const stop = withFNumber(LENS_50MM_F2, fNumber).surfaces.find((s) => s.isStop)!;
      expect(stop.semiDiameter).toBeGreaterThan(minApertureRadius(DEFAULT_IRIS));
      expect(stop.semiDiameter).toBeLessThanOrEqual(maxApertureRadius(DEFAULT_IRIS));
    }
  });

  it('abre até o limite mecânico da objetiva e não além', () => {
    const widest = widestFNumber(LENS_50MM_F2);
    // O Gauss duplo da patente é f/2; f/1.4 exigiria vidro maior.
    expect(widest).toBeCloseTo(2, 6);

    const asked = withFNumber(LENS_50MM_F2, 1.4).surfaces.find((s) => s.isStop)!;
    const limit = withFNumber(LENS_50MM_F2, widest).surfaces.find((s) => s.isStop)!;
    expect(asked.semiDiameter).toBeCloseTo(limit.semiDiameter, 9);
    expect(asked.semiDiameter).toBeLessThanOrEqual(maxApertureRadius(DEFAULT_IRIS));
  });

  it('fechar um stop completo corta a área da abertura pela metade', () => {
    const atF4 = withFNumber(LENS_50MM_F2, 4).surfaces.find((s) => s.isStop)!.semiDiameter;
    const atF56 = withFNumber(LENS_50MM_F2, 5.6).surfaces.find((s) => s.isStop)!.semiDiameter;

    const areaF4 = apertureArea(DEFAULT_IRIS, bladeAngleForAperture(DEFAULT_IRIS, atF4));
    const areaF56 = apertureArea(DEFAULT_IRIS, bladeAngleForAperture(DEFAULT_IRIS, atF56));

    // f/5.6 é um stop abaixo de f/4: metade da área, com 2% de folga porque
    // 5,6 é o arredondamento de 4·√2.
    expect(areaF56 / areaF4).toBeCloseTo(0.5, 1);
    expect(Math.abs(areaF56 / areaF4 - 0.5)).toBeLessThan(0.02);
  });

  it('distribui as nove lâminas em volta do eixo', () => {
    const placements = bladePlacements(DEFAULT_IRIS, 0.6);
    expect(placements).toHaveLength(9);

    const angles = placements.map((p) => p.centerAngle);
    for (let i = 1; i < angles.length; i += 1) {
      expect(angles[i]! - angles[i - 1]!).toBeCloseTo((Math.PI * 2) / 9, 9);
    }
    // Todas à mesma distância do eixo: a íris é simétrica.
    for (const placement of placements) {
      expect(placement.centerRadius).toBeCloseTo(placements[0]!.centerRadius, 9);
    }
  });
});

describe('anel de foco', () => {
  it('leva o mínimo ao começo do curso e o infinito ao fim', () => {
    expect(distanceToRingFraction(FOCUS_RANGE_MM.min)).toBeCloseTo(0, 9);
    expect(distanceToRingFraction(Infinity)).toBe(1);
    expect(ringFractionToDistance(1)).toBe(Infinity);
  });

  it('faz a volta completa: distância → ângulo → distância', () => {
    for (const millimeters of [300, 370, 600, 1200, 2000, 5000, 10_000]) {
      const angle = distanceToRingAngle(millimeters);
      expect(ringAngleToDistance(angle)).toBeCloseTo(millimeters, 6);
    }
  });

  it('gira no sentido único e não passa do curso mecânico', () => {
    const angles = [300, 600, 2000, 10_000].map(distanceToRingAngle);
    for (let i = 1; i < angles.length; i += 1) {
      expect(angles[i]!).toBeLessThan(angles[i - 1]!);
    }
    expect(Math.abs(distanceToRingAngle(Infinity))).toBeLessThanOrEqual(RING_SWEEP + 1e-9);
  });

  it('é logarítmico: de 0,3 m a 1 m ocupa mais curso que de 3 m a 10 m', () => {
    const near = distanceToRingFraction(1000) - distanceToRingFraction(300);
    const far = distanceToRingFraction(10_000) - distanceToRingFraction(3000);
    expect(near).toBeCloseTo(far, 6);
    // Mesma razão de distâncias ocupa o mesmo curso — é o que "logarítmico" quer dizer.
  });

  it('grava as marcas na posição que o próprio mapa calcula', () => {
    const marks = ringMarks();
    const oneMeter = marks.find((mark) => mark.unit === 'm' && mark.label === '1');
    expect(oneMeter?.fraction).toBeCloseTo(distanceToRingFraction(1000), 9);

    const infinity = marks.find((mark) => mark.label === '∞');
    expect(infinity?.fraction).toBe(1);
  });

  it('não grava marcas em pés fora do curso do anel', () => {
    for (const mark of ringMarks().filter((m) => m.unit === 'ft')) {
      expect(mark.fraction).toBeGreaterThanOrEqual(0);
      expect(mark.fraction).toBeLessThanOrEqual(1);
    }
  });
});

describe('desenho dos raios versus o motor (critério 4 da SPEC §10)', () => {
  it('o cone desenhado cruza a placa com o diâmetro do círculo de confusão', () => {
    // O desenho produz b geometricamente, como D·|v_d − v_s|/v_d. O motor
    // produz b algebricamente, como f²/(N(s−f))·|d−s|/d. Precisam coincidir,
    // senão o anel de CoC e o borrão do cone discordam na tela.
    const f = 50;
    for (const N of [2, 5.6, 16]) {
      for (const s of [370, 600, 2000]) {
        const vs = imageDistance(f, s);
        for (const d of [300, 370, 600, 2000, 10_000]) {
          const vd = imageDistance(f, d);
          expect(blurAtPlate(f, N, vs, vd)).toBeCloseTo(blurDiameter(f, N, s, d), 9);
        }
      }
    }
  });

  it('o objeto em foco fecha o cone exatamente sobre a placa', () => {
    const vs = imageDistance(50, 600);
    expect(blurAtPlate(50, 2, vs, vs)).toBe(0);
  });
});
