import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAGNETIC,
  type FieldSample,
  cyclotronPeriod,
  electronMomentum,
  electronSpeed,
  gyroRadius,
  helixPitch,
  helmholtzCurrent,
  helmholtzField,
  traceElectron,
  voltageForSpeed,
  wienSpeed,
} from '../../src/optics/fields/lorentz';

/** Força magnética sobre elétrons (ADR 0010). */

const uniform =
  (B: readonly [number, number, number], E: readonly [number, number, number] = [0, 0, 0]) =>
  (): FieldSample => ({ E, B });
const never = (): null => null;

const farthestFromStart = (points: Float32Array): number => {
  let best = 0;
  for (let i = 3; i < points.length; i += 3) {
    best = Math.max(best, Math.hypot(points[i]! - points[0]!, points[i + 1]! - points[1]!, points[i + 2]! - points[2]!));
  }
  return best;
};

describe('elétron acelerado', () => {
  it('a 250 V anda a 9,38 × 10⁶ m/s', () => {
    // √(2eU/m) daria 9,3778e6; a correção relativística, −(3/4)·eU/mc² =
    // −3,7e-4, leva a 9,3742e6.
    expect(electronSpeed(250)).toBeCloseTo(9.3742e6, -3);
  });

  it('voltageForSpeed é a inversa de electronSpeed', () => {
    for (const voltage of [10, 250, 5000]) expect(voltageForSpeed(electronSpeed(voltage))).toBeCloseTo(voltage, 6);
  });
});

describe('bobinas de Helmholtz', () => {
  it('200 espiras, 1 A, raio 30 cm dão 0,600 mT', () => {
    // (4/5)^{3/2} · 4π×10⁻⁷ · 200 · 1 / 0,3
    expect(helmholtzField(200, 1, 0.3)).toBeCloseTo(5.9945e-4, 7);
  });

  it('helmholtzCurrent é a inversa', () => {
    expect(helmholtzCurrent(helmholtzField(200, 2.5, 0.3), 200, 0.3)).toBeCloseTo(2.5, 10);
  });
});

describe('órbitas', () => {
  const voltage = 250;
  const field = 0.8e-3;
  const p = electronMomentum(voltage);

  it('raio de giro r = p/(eB): 6,67 cm a 250 V e 0,8 mT', () => {
    expect(gyroRadius(p, field)).toBeCloseTo(0.06667, 4);
  });

  it('a trajetória integrada fecha um círculo do raio calculado', () => {
    const r = gyroRadius(p, field);
    const trace = traceElectron({
      position: [0, 0, 0],
      direction: [1, 0, 0],
      voltage,
      field: uniform([0, 0, field]),
      stop: never,
      maxLength: 2 * Math.PI * r,
    });
    // O ponto mais distante da largada é o diâmetro.
    expect(farthestFromStart(trace.points) / (2 * r)).toBeCloseTo(1, 3);
  });

  it('o elétron (carga negativa) com B em +z curva para +y', () => {
    const trace = traceElectron({
      position: [0, 0, 0],
      direction: [1, 0, 0],
      voltage,
      field: uniform([0, 0, field]),
      stop: never,
      maxLength: 0.02,
    });
    expect(trace.points[trace.points.length - 2]!).toBeGreaterThan(0);
  });

  it('só campo magnético: a energia se conserva por 20 voltas', () => {
    const r = gyroRadius(p, field);
    const trace = traceElectron({
      position: [0, 0, 0],
      direction: [1, 0, 0],
      voltage,
      field: uniform([0, 0, field]),
      stop: never,
      maxLength: 40 * Math.PI * r,
      sampleAngle: 0.5,
    });
    // Sem ganho de energia o raio não cresce: o círculo pelos três primeiros
    // pontos e o pelos três últimos têm o mesmo raio.
    const circumradius = (i: number): number => {
      const P = trace.points;
      const ax = P[i]!, ay = P[i + 1]!, bx = P[i + 3]!, by = P[i + 4]!, cx = P[i + 6]!, cy = P[i + 7]!;
      const a = Math.hypot(bx - cx, by - cy);
      const b = Math.hypot(ax - cx, ay - cy);
      const c = Math.hypot(ax - bx, ay - by);
      const area = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
      return (a * b * c) / (4 * area);
    };
    const last = trace.points.length - 12;
    expect(circumradius(0) / r).toBeCloseTo(1, 3);
    expect(circumradius(last) / circumradius(0)).toBeCloseTo(1, 4);
  });

  it('a 60° do campo: hélice com o passo 2πp·cos θ/(eB)', () => {
    const theta = Math.PI / 3;
    const period = cyclotronPeriod(voltage, field);
    const v = electronSpeed(voltage);
    const trace = traceElectron({
      position: [0, 0, 0],
      direction: [Math.sin(theta), 0, Math.cos(theta)],
      voltage,
      field: uniform([0, 0, field]),
      stop: never,
      maxLength: v * period,
    });
    const last = trace.points.length - 3;
    expect(trace.points[last + 2]! / helixPitch(p, field, theta)).toBeCloseTo(1, 3);
    // E volta ao mesmo x, y depois de uma volta.
    expect(Math.hypot(trace.points[last]!, trace.points[last + 1]!)).toBeLessThan(1e-3);
  });
});

describe('seletor de velocidades', () => {
  const B = DEFAULT_MAGNETIC.selectorField;

  it('com E = vB o elétron passa reto', () => {
    const v = electronSpeed(250);
    const E = v * B;
    expect(wienSpeed(E, B)).toBeCloseTo(v, 6);
    // E para cima (+y) e B em +z: a força elétrica puxa o elétron para baixo,
    // a magnética para cima.
    const trace = traceElectron({
      position: [0, 0, 0],
      direction: [1, 0, 0],
      voltage: 250,
      field: uniform([0, 0, B], [0, E, 0]),
      stop: never,
      maxLength: DEFAULT_MAGNETIC.selectorLength,
    });
    expect(Math.abs(trace.points[trace.points.length - 2]!)).toBeLessThan(1e-6);
  });

  it('mais lento que E/B desvia para a placa positiva e para', () => {
    const E = electronSpeed(250) * B;
    const half = DEFAULT_MAGNETIC.selectorGap / 2;
    const trace = traceElectron({
      position: [0, 0, 0],
      direction: [1, 0, 0],
      voltage: 150,
      field: uniform([0, 0, B], [0, E, 0]),
      stop: (_x, y) => (Math.abs(y) >= half ? 'placa' : null),
      maxLength: 1,
    });
    expect(trace.end).toBe('placa');
    expect(trace.points[trace.points.length - 2]!).toBeLessThan(0);
  });
});
