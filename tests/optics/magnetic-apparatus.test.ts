import { describe, expect, it } from 'vitest';
import { DEFAULT_MAGNETIC, electronSpeed, voltageForSpeed, wienSpeed } from '../../src/optics/fields/lorentz';
import {
  BEAM_Y,
  INNER_TUBE,
  energySamples,
  traceThroughApparatus,
} from '../../src/experiments/magnetic-force/apparatus';
import { INITIAL_MAGNETIC_STATE, type MagneticState } from '../../src/experiments/magnetic-force/state';

/** O aparelho da força magnética montado (ADR 0010): seletor, câmara, vidro. */

const state = (patch: Partial<MagneticState> = {}): MagneticState => ({ ...INITIAL_MAGNETIC_STATE, ...patch });

describe('aparelho da força magnética', () => {
  it('sem seletor, todo o feixe chega à câmara e fecha quase uma volta', () => {
    for (const fraction of energySamples(state(), null)) {
      const path = traceThroughApparatus(state(), fraction);
      expect(path.reachedChamber).toBe(true);
      // A 0,5 mT todos os círculos cabem no vidro: param no tubo do canhão.
      expect(path.trace.end).toBe('tube');
    }
  });

  it('com o seletor, só passa quem tem v ≈ E/B', () => {
    const s = state({ selector: true });
    const v = wienSpeed(s.selectorVoltage / DEFAULT_MAGNETIC.selectorGap, DEFAULT_MAGNETIC.selectorField);
    const selected = voltageForSpeed(v) / s.voltage;
    for (const fraction of energySamples(s, selected)) {
      const path = traceThroughApparatus(s, fraction);
      const relative = electronSpeed(s.voltage * fraction) / v - 1;
      // Aceitação da fenda: cerca de 1% em velocidade.
      if (Math.abs(relative) < 0.005) expect(path.reachedChamber).toBe(true);
      if (Math.abs(relative) > 0.02) expect(path.reachedChamber).toBe(false);
    }
  });

  it('campo paralelo ao feixe: reta até o vidro do outro lado', () => {
    const path = traceThroughApparatus(state({ angle: 90 }), 1);
    expect(path.trace.end).toBe('glass');
    const p = path.trace.points;
    // Sem desvio: o último ponto continua na altura do feixe.
    expect(p[p.length - 2]!).toBeCloseTo(BEAM_Y, 3);
    expect(p[p.length - 3]!).toBeGreaterThan(INNER_TUBE.end);
  });
});
