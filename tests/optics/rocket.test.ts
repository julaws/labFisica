import { describe, expect, it } from 'vitest';
import {
  G0,
  type Vehicle,
  buildVehicle,
  exhaustVelocity,
  idealDeltaV,
  liftoffMass,
  sampleAt,
  simulateFlight,
  tsiolkovsky,
} from '../../src/optics/mechanics/rocket';

/** Foguete: Tsiolkovsky e conservação do momento (ADR 0020). */

const single = (isp = 300): Vehicle => ({
  payload: 1000,
  dragArea: 5,
  stages: [{ dryMass: 4000, propellant: 45_000, isp, massFlow: 300 }],
});

describe('Tsiolkovsky', () => {
  it('Δv = v_e·ln(m₀/m_f) com v_e = I_sp·g₀', () => {
    expect(exhaustVelocity(300)).toBeCloseTo(2941.995, 3);
    expect(tsiolkovsky(3000, 100, 100 / Math.E)).toBeCloseTo(3000, 9);
  });

  it('dobrar v_e dobra o Δv', () => {
    const a = idealDeltaV(single(250)).total;
    const b = idealDeltaV(single(500)).total;
    expect(b / a).toBeCloseTo(2, 12);
  });

  it('o Δv cresce com o logaritmo da razão de massas', () => {
    const ve = 3000;
    const r = [2, 4, 8, 16];
    const dv = r.map((ratio) => tsiolkovsky(ve, ratio, 1));
    // Razões em progressão geométrica dão Δv em progressão aritmética.
    for (let i = 1; i < dv.length; i += 1) expect(dv[i]! - dv[i - 1]!).toBeCloseTo(ve * Math.log(2), 9);
  });

  it('estágios somam os seus Δv, com a massa de cima como carga', () => {
    const vehicle = buildVehicle({
      propellant: 100_000,
      dryMass: 8000,
      isp: 320,
      massFlow: 500,
      stages: 2,
      payload: 1000,
      dragArea: 8,
    });
    const { stages, total } = idealDeltaV(vehicle);
    expect(stages).toHaveLength(2);
    expect(total).toBeCloseTo(stages[0]! + stages[1]!, 9);
    // Mais Δv que o mesmo foguete num estágio só: é por isso que existem estágios.
    const one = idealDeltaV(buildVehicle({ propellant: 100_000, dryMass: 8000, isp: 320, massFlow: 500, stages: 1, payload: 1000, dragArea: 8 }));
    expect(total).toBeGreaterThan(one.total);
  });
});

describe('integração numérica', () => {
  it('sem gravidade nem arrasto, a velocidade final é a de Tsiolkovsky', () => {
    const vehicle = single();
    const flight = simulateFlight(vehicle, { gravity: false, drag: false, dt: 0.1, coast: 0 });
    const expected = idealDeltaV(vehicle).total;
    expect(Math.abs(flight.burnout.velocity / expected - 1)).toBeLessThan(1e-9);
  });

  it('com três estágios também', () => {
    const vehicle = buildVehicle({ propellant: 200_000, dryMass: 15_000, isp: 350, massFlow: 900, stages: 3, payload: 1500, dragArea: 10 });
    const flight = simulateFlight(vehicle, { gravity: false, drag: false, dt: 0.2, coast: 0 });
    expect(Math.abs(flight.burnout.velocity / idealDeltaV(vehicle).total - 1)).toBeLessThan(1e-9);
    expect(flight.burnouts).toHaveLength(3);
  });

  it('o momento total (foguete + gás + estágios soltos) fica zero sem forças externas', () => {
    const vehicle = buildVehicle({ propellant: 120_000, dryMass: 9000, isp: 300, massFlow: 600, stages: 2, payload: 1000, dragArea: 8 });
    const flight = simulateFlight(vehicle, { gravity: false, drag: false, dt: 0.1, coast: 10 });
    for (const sample of flight.samples) {
      const total = sample.rocketMomentum + sample.gasMomentum + sample.droppedMomentum;
      const scale = Math.abs(sample.rocketMomentum) + Math.abs(sample.gasMomentum) + 1;
      expect(Math.abs(total) / scale).toBeLessThan(1e-9);
    }
    // O momento ganho pelo foguete é o levado pelo gás (e pelos estágios).
    const end = flight.burnout;
    expect(end.rocketMomentum + end.droppedMomentum).toBeCloseTo(-end.gasMomentum, 0);
  });

  it('com gravidade e arrasto, o momento total muda exatamente pelo impulso externo', () => {
    const vehicle = single(310);
    const flight = simulateFlight(vehicle, { gravity: true, drag: true, dt: 0.05, coast: 20 });
    for (const sample of flight.samples) {
      const total = sample.rocketMomentum + sample.gasMomentum + sample.droppedMomentum;
      expect(Math.abs(total - sample.externalImpulse) / (Math.abs(sample.gasMomentum) + 1)).toBeLessThan(1e-6);
    }
  });

  it('perdas: v_final = Δv ideal − perda por gravidade − perda por arrasto', () => {
    const vehicle = single(310);
    const flight = simulateFlight(vehicle, { gravity: true, drag: true, dt: 0.05, coast: 0 });
    const end = flight.burnout;
    expect(end.velocity).toBeCloseTo(idealDeltaV(vehicle).total - end.gravityLoss - end.dragLoss, 3);
    expect(end.gravityLoss).toBeGreaterThan(0);
    expect(end.dragLoss).toBeGreaterThan(0);
    // A perda por gravidade é ≈ g·t de queima (um pouco menos: g cai com a altitude).
    const burn = 45_000 / 300;
    expect(end.gravityLoss).toBeLessThan(G0 * burn);
    expect(end.gravityLoss).toBeGreaterThan(0.95 * G0 * burn);
  });

  it('empuxo menor que o peso: o foguete não sai da plataforma', () => {
    const weak: Vehicle = { ...single(), stages: [{ dryMass: 4000, propellant: 45_000, isp: 300, massFlow: 100 }] };
    expect(exhaustVelocity(300) * 100).toBeLessThan(liftoffMass(weak) * G0);
    const flight = simulateFlight(weak, { gravity: true, drag: false, dt: 0.1, coast: 0 });
    expect(flight.cannotLiftOff).toBe(true);
    expect(flight.samples[10]!.altitude).toBe(0);
    expect(flight.samples[10]!.grounded).toBe(true);
  });

  it('interpolação no tempo', () => {
    const flight = simulateFlight(single(), { gravity: false, drag: false, dt: 0.5, coast: 0 });
    const mid = sampleAt(flight, 10.25);
    expect(mid.t).toBe(10.25);
    expect(mid.mass).toBeCloseTo(liftoffMass(single()) - 300 * 10.25, 6);
  });
});
