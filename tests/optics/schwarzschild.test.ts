import { describe, expect, it } from 'vitest';
import {
  CRITICAL_IMPACT_PARAMETER,
  ISCO_RADIUS,
  SOLAR_GRAVITATIONAL_RADIUS_KM,
  deflection,
  diskRedshift,
  diskTemperature,
  einsteinAngleWeak,
  einsteinAngleWeakFar,
  einsteinRingAngle,
  isCaptured,
  rayPath,
  schwarzschildRadiusKm,
  shadowAngularRadius,
  traceFromInfinity,
  traceFromObserver,
  weakDeflection,
} from '../../src/optics/gravity/schwarzschild';

/** Luz em volta de um buraco negro de Schwarzschild (ADR 0017). Unidades de M. */

describe('constantes', () => {
  it('GM☉/c² = 1,4766 km e o raio de Schwarzschild do Sol é 2,95 km', () => {
    expect(SOLAR_GRAVITATIONAL_RADIUS_KM).toBeCloseTo(1.47663, 4);
    expect(schwarzschildRadiusKm(1)).toBeCloseTo(2.9533, 3);
  });

  it('o raio crítico (raio da sombra vista de longe) é 3√3 M', () => {
    expect(CRITICAL_IMPACT_PARAMETER).toBeCloseTo(5.196152, 6);
  });
});

describe('campo fraco', () => {
  it('a deflexão converge para 4M/b quando b cresce', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (const b of [100, 1000, 10_000]) {
      const ratio = deflection(b) / weakDeflection(b);
      const error = Math.abs(ratio - 1);
      expect(error).toBeLessThan(previous);
      previous = error;
    }
    expect(Math.abs(deflection(10_000) / weakDeflection(10_000) - 1)).toBeLessThan(1e-3);
  });

  it('o termo de segunda ordem é 15π/4·(M/b)²', () => {
    // α = 4M/b + 15π/4·(M/b)² + O((M/b)³) (Keeton e Petters, 2005).
    const b = 200;
    const second = deflection(b) - 4 / b;
    expect(second / ((15 * Math.PI) / 4 / (b * b))).toBeCloseTo(1, 1);
  });

  it('a luz rasante ao Sol desvia 1,75″', () => {
    const solarRadiusKm = 695_700;
    const b = solarRadiusKm / SOLAR_GRAVITATIONAL_RADIUS_KM;
    const arcsec = (deflection(b) * 180 * 3600) / Math.PI;
    expect(arcsec).toBeCloseTo(1.751, 2);
  });
});

describe('captura e escape', () => {
  it('raios com b < b_c caem no horizonte; com b > b_c escapam', () => {
    for (const factor of [0.5, 0.9, 0.999]) {
      const b = CRITICAL_IMPACT_PARAMETER * factor;
      expect(traceFromInfinity(b).captured).toBe(true);
      expect(isCaptured(b)).toBe(true);
    }
    for (const factor of [1.001, 1.1, 2]) {
      const b = CRITICAL_IMPACT_PARAMETER * factor;
      expect(traceFromInfinity(b).captured).toBe(false);
      expect(isCaptured(b)).toBe(false);
    }
  });

  it('a borda entre capturar e escapar, achada numericamente, é 3√3 M', () => {
    let lo = 4;
    let hi = 7;
    for (let i = 0; i < 40; i += 1) {
      const mid = 0.5 * (lo + hi);
      if (traceFromInfinity(mid, { maxPhi: 200 }).captured) lo = mid;
      else hi = mid;
    }
    expect(0.5 * (lo + hi)).toBeCloseTo(3 * Math.sqrt(3), 4);
  });

  it('perto de b_c a luz dá voltas: a máxima aproximação tende à esfera de fótons', () => {
    const near = traceFromInfinity(CRITICAL_IMPACT_PARAMETER * (1 + 1e-6));
    expect(near.captured).toBe(false);
    expect(near.minRadius).toBeCloseTo(3, 2);
    // Mais de uma volta inteira em torno do buraco negro.
    expect(near.phiExit).toBeGreaterThan(3 * Math.PI);
  });

  it('a esfera de fótons é uma órbita circular: u = 1/3 é ponto fixo', () => {
    expect(-1 / 3 + 3 * (1 / 3) ** 2).toBeCloseTo(0, 12);
  });
});

describe('sombra', () => {
  it('vista de longe, a sombra tem raio angular b_c/r', () => {
    const r = 1e5;
    expect(shadowAngularRadius(r) * r).toBeCloseTo(CRITICAL_IMPACT_PARAMETER, 3);
  });

  it('a borda da sombra é a borda da captura para um observador a 20 M', () => {
    const r = 20;
    const edge = shadowAngularRadius(r);
    expect(traceFromObserver(r, edge * 0.999, { maxPhi: 200 }).captured).toBe(true);
    expect(traceFromObserver(r, edge * 1.001, { maxPhi: 200 }).captured).toBe(false);
  });

  it('na esfera de fótons, a sombra cobre exatamente meio céu', () => {
    expect(shadowAngularRadius(3)).toBeCloseTo(Math.PI / 2, 9);
    expect(shadowAngularRadius(2.5)).toBeGreaterThan(Math.PI / 2);
  });
});

describe('anel de Einstein', () => {
  it('com a fonte no infinito, θ_E = √(4M/D_L) (D_LS/D_S → 1)', () => {
    expect(einsteinAngleWeak(1e4, 1e12, 1e12 - 1e4)).toBeCloseTo(einsteinAngleWeakFar(1e4), 8);
  });

  it('o anel exato converge para o de campo fraco quando o observador se afasta', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (const r of [100, 1000, 10_000]) {
      const error = Math.abs(einsteinRingAngle(r) / einsteinAngleWeakFar(r) - 1);
      expect(error).toBeLessThan(previous);
      previous = error;
    }
    expect(previous).toBeLessThan(0.01);
  });

  it('o anel relativístico (uma volta a mais) fica colado à sombra', () => {
    const r = 50;
    const first = einsteinRingAngle(r, 1);
    const shadow = shadowAngularRadius(r);
    expect(first).toBeGreaterThan(shadow);
    expect(first / shadow - 1).toBeLessThan(0.01);
    expect(einsteinRingAngle(r, 0)).toBeGreaterThan(first);
  });
});

describe('trajetórias', () => {
  it('um raio capturado termina no horizonte; um que escapa sai do desenho', () => {
    const r = 30;
    const shadow = shadowAngularRadius(r);
    const inside = rayPath(r, shadow * 0.9, { maxRadius: 40 });
    const last = inside.points.at(-1)!;
    expect(inside.captured).toBe(true);
    expect(Math.hypot(last[0], last[1])).toBeCloseTo(2, 1);
    const outside = rayPath(r, shadow * 1.5, { maxRadius: 40 });
    expect(outside.captured).toBe(false);
  });
});

describe('disco de acreção', () => {
  it('a temperatura é zero na borda de dentro e tem máximo 1 em 49/36·r_in', () => {
    expect(diskTemperature(ISCO_RADIUS)).toBe(0);
    expect(diskTemperature((49 / 36) * ISCO_RADIUS)).toBeCloseTo(1, 12);
    expect(diskTemperature(10)).toBeLessThan(1);
    expect(diskTemperature(40)).toBeLessThan(diskTemperature(12));
  });

  it('desvio só gravitacional e transversal para λ = 0; Doppler para o azul do lado que vem', () => {
    const r = 10;
    expect(diskRedshift(r, 0)).toBeCloseTo(Math.sqrt(1 - 3 / r), 12);
    expect(diskRedshift(r, 5)).toBeGreaterThan(diskRedshift(r, 0));
    expect(diskRedshift(r, -5)).toBeLessThan(diskRedshift(r, 0));
    // Longe do buraco negro e sem movimento na linha de visada, g → 1.
    expect(diskRedshift(1e6, 0)).toBeCloseTo(1, 5);
  });
});
