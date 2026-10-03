import {
  DEFAULT_MAGNETIC,
  type FieldSample,
  type Trace,
  electronMomentum,
  gyroRadius,
  traceElectron,
} from '../../optics/fields/lorentz';
import type { MagneticState } from './state';

/**
 * Geometria do aparelho (ADR 0010), em metros, escala 1:1, no referencial do
 * centro da câmara de vidro: x ao longo do feixe, y para cima, z para a
 * frente da bancada (para a câmera).
 *
 *     canhão ── gargalo ── seletor ── fenda ── gargalo ── câmara (bobinas)
 *
 * O feixe corre na altura `BEAM_Y`, abaixo do centro: dentro da câmara ele
 * sai de um tubo interno quase no meio e curva para cima, como num tubo de
 * feixe fino (Teltron), onde o círculo inteiro cabe no vidro.
 */

export const CHAMBER_RADIUS = DEFAULT_MAGNETIC.chamberRadius;
export const COIL_RADIUS = DEFAULT_MAGNETIC.coilRadius;
export const BEAM_Y = -0.15;
/** Ponta do canhão, onde o elétron começa. */
export const NOZZLE_X = -1.05;
export const SELECTOR = {
  start: -0.78,
  end: -0.78 + DEFAULT_MAGNETIC.selectorLength,
  gap: DEFAULT_MAGNETIC.selectorGap,
} as const;
/** Fenda na saída do seletor. */
export const APERTURE = { x: SELECTOR.end + 0.02, half: DEFAULT_MAGNETIC.selectorAperture } as const;
/** Gargalo de vidro (raio) e tubo interno, de onde o feixe sai na câmara. */
export const NECK_RADIUS = 0.022;
export const INNER_TUBE = { end: -0.06, radius: 0.012 } as const;
/** Onde o gargalo encontra a esfera. */
export const NECK_JOIN_X = -Math.sqrt(CHAMBER_RADIUS ** 2 - BEAM_Y ** 2);

/** Direção do campo das bobinas giradas de `angle` graus em torno de y. */
export function fieldDirection(angle: number): [number, number, number] {
  const a = (angle * Math.PI) / 180;
  return [Math.sin(a), 0, Math.cos(a)];
}

/** Ângulo entre o feixe (+x) e o campo, rad. */
export function pitchAngle(angle: number): number {
  const [bx] = fieldDirection(angle);
  return Math.acos(Math.min(1, Math.max(-1, bx)));
}

const ZERO: readonly [number, number, number] = [0, 0, 0];

export interface ElectronPath {
  readonly trace: Trace;
  /** Fração de eU com que o elétron sai do canhão. */
  readonly energyFraction: number;
  /** Passou pelo seletor e entrou na câmara. */
  readonly reachedChamber: boolean;
}

/**
 * Integra um elétron de energia `energyFraction`·eU pelo aparelho inteiro,
 * com os campos do estado atual. Para no vidro, nas placas, na fenda ou no
 * tubo interno.
 */
export function traceThroughApparatus(state: Readonly<MagneticState>, energyFraction: number): ElectronPath {
  const voltage = state.voltage * energyFraction;
  const [bx, by, bz] = fieldDirection(state.angle);
  const chamberField: FieldSample = {
    E: ZERO,
    B: [bx * state.field, by * state.field, bz * state.field],
  };
  // Seletor: E para cima entre as placas, B das bobinas dele em +z.
  const selectorE = state.selectorVoltage / SELECTOR.gap;
  const selectorField: FieldSample = state.selector
    ? { E: [0, selectorE, 0], B: [0, 0, DEFAULT_MAGNETIC.selectorField] }
    : { E: ZERO, B: ZERO };
  const empty: FieldSample = { E: ZERO, B: ZERO };
  const r2 = CHAMBER_RADIUS * CHAMBER_RADIUS;

  const field = (x: number, y: number, z: number): FieldSample => {
    // O tubo interno é blindado (mu-metal): o campo só age depois que o
    // elétron sai dele, como no canhão de um tubo de feixe fino.
    if (x > NECK_JOIN_X && x < INNER_TUBE.end && Math.hypot(y - BEAM_Y, z) < INNER_TUBE.radius) return empty;
    if (x * x + y * y + z * z < r2) return chamberField;
    if (x >= SELECTOR.start && x <= SELECTOR.end && Math.abs(y - BEAM_Y) < SELECTOR.gap / 2) return selectorField;
    return empty;
  };

  let previousX = NOZZLE_X;
  let leftTube = false;
  let reachedChamber = false;
  const wall = (CHAMBER_RADIUS - 0.004) ** 2;
  const stop = (x: number, y: number, z: number): string | null => {
    const off = Math.hypot(y - BEAM_Y, z);
    const crossing = previousX < APERTURE.x && x >= APERTURE.x;
    previousX = x;
    if (x >= SELECTOR.start && x <= SELECTOR.end && Math.abs(y - BEAM_Y) >= SELECTOR.gap / 2) return 'plate';
    if (crossing && (Math.abs(y - BEAM_Y) > APERTURE.half || Math.abs(z) > APERTURE.half * 3)) return 'aperture';
    if (x < NECK_JOIN_X) {
      if (leftTube) return 'tube';
      return off > NECK_RADIUS ? 'glass' : null;
    }
    if (!leftTube) {
      if (x > INNER_TUBE.end + 0.002) {
        leftTube = true;
        reachedChamber = true;
      }
      return null;
    }
    if (x < INNER_TUBE.end && off < INNER_TUBE.radius + 0.002) return 'tube';
    if (x * x + y * y + z * z >= wall) return 'glass';
    return null;
  };

  // Até ~6 voltas na câmara: depois disso o círculo só se repete por cima.
  const radius = gyroRadius(electronMomentum(voltage), state.field, pitchAngle(state.angle));
  const inChamber = Number.isFinite(radius) ? Math.min(3.2, 2 * Math.PI * radius * 6 + 0.6) : 1;
  const trace = traceElectron({
    position: [NOZZLE_X, BEAM_Y, 0],
    direction: [1, 0, 0],
    voltage,
    field,
    stop,
    step: 6e-4,
    maxLength: Math.abs(NOZZLE_X - INNER_TUBE.end) + inChamber,
    sampleAngle: (3 * Math.PI) / 180,
    sampleLength: 0.04,
  });
  return { trace, energyFraction, reachedChamber };
}

/** Frações de energia dos elétrons desenhados. */
export function energySamples(state: Readonly<MagneticState>, selectedFraction: number | null): number[] {
  const samples: number[] = [];
  if (state.spread === 'none') samples.push(1);
  else {
    const { min, max } = DEFAULT_MAGNETIC.spread;
    const count = 9;
    for (let i = 0; i < count; i += 1) samples.push(min + ((max - min) * i) / (count - 1));
  }
  // Com o seletor ligado, o elétron que ele escolhe também é desenhado, se o
  // feixe tiver algum com essa energia.
  if (state.selector && selectedFraction !== null && state.spread === 'wide') {
    const { min, max } = DEFAULT_MAGNETIC.spread;
    if (selectedFraction >= min && selectedFraction <= max) samples.push(selectedFraction);
  }
  return samples;
}
