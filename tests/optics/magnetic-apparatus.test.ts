import { describe, expect, it } from 'vitest';
import { electronMomentum, gyroRadius } from '../../src/optics/fields/lorentz';
import {
  BEAM_Y,
  INNER_TUBE,
  electronPath,
  energySamples,
  pathPoints,
} from '../../src/experiments/magnetic-force/apparatus';
import { INITIAL_MAGNETIC_STATE, type MagneticState } from '../../src/experiments/magnetic-force/state';

/** O aparelho da força magnética montado (ADR 0010): canhão, câmara, vidro. */

const state = (patch: Partial<MagneticState> = {}): MagneticState => ({ ...INITIAL_MAGNETIC_STATE, ...patch });

describe('aparelho da força magnética', () => {
  it('a 0,5 mT todos os círculos cabem no vidro e voltam ao tubo do canhão', () => {
    for (const fraction of energySamples(state())) {
      expect(electronPath(state(), fraction).helix.reason).toBe('tube');
    }
  });

  it('o ponto mais alto do círculo fica a 2r da altura do feixe', () => {
    const s = state();
    const r = gyroRadius(electronMomentum(s.voltage), s.field);
    const p = pathPoints(electronPath(s, 1));
    let top = -Infinity;
    for (let i = 1; i < p.length; i += 3) top = Math.max(top, p[i]!);
    // Amostras a cada 4°: o topo amostrado fica a menos de 0,1% abaixo do real.
    expect((top - BEAM_Y) / (2 * r)).toBeCloseTo(1, 2);
  });

  it('campo paralelo ao feixe: reta até o vidro do outro lado', () => {
    const path = electronPath(state({ angle: 90 }), 1);
    expect(path.helix.reason).toBe('glass');
    const p = pathPoints(path);
    // Sem desvio: o último ponto continua na altura do feixe.
    expect(p[p.length - 2]!).toBeCloseTo(BEAM_Y, 6);
    expect(p[p.length - 3]!).toBeGreaterThan(INNER_TUBE.end);
  });

  it('energia única desenha um elétron; espalhada, cinco', () => {
    expect(energySamples(state({ spread: 'none' }))).toEqual([1]);
    expect(energySamples(state())).toHaveLength(5);
  });
});
