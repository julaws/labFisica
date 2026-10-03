import { DEFAULT_MAGNETIC, type HelixPath, helixPath, helixPoint } from '../../optics/fields/lorentz';
import type { MagneticState } from './state';

/**
 * Geometria do aparelho (ADR 0010), em metros, escala 1:1, no referencial do
 * centro da câmara de vidro: x ao longo do feixe, y para cima, z para a
 * frente da bancada (para a câmera).
 *
 *     canhão ── gargalo ── tubo interno ── câmara (bobinas)
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

export interface ElectronPath {
  /** Hélice na câmara, da saída do tubo interno até onde o elétron para. */
  readonly helix: HelixPath;
  /** Fração de eU com que o elétron sai do canhão. */
  readonly energyFraction: number;
}

/**
 * Caminho de um elétron de energia `energyFraction`·eU. No gargalo e no tubo
 * interno não há campo (o tubo é blindado): reta do canhão à saída do tubo.
 * Na câmara, o campo das bobinas é uniforme, e a trajetória é a hélice exata
 * do motor, até o vidro ou o tubo do canhão.
 */
export function electronPath(state: Readonly<MagneticState>, energyFraction: number): ElectronPath {
  const [bx, by, bz] = fieldDirection(state.angle);
  const wall = (CHAMBER_RADIUS - 0.004) ** 2;
  const stop = (x: number, y: number, z: number): string | null => {
    if (x < INNER_TUBE.end && Math.hypot(y - BEAM_Y, z) < INNER_TUBE.radius + 0.002) return 'tube';
    if (x * x + y * y + z * z >= wall) return 'glass';
    return null;
  };
  const helix = helixPath({
    position: [INNER_TUBE.end, BEAM_Y, 0],
    direction: [1, 0, 0],
    voltage: state.voltage * energyFraction,
    field: [bx * state.field, by * state.field, bz * state.field],
    stop,
    // Até ~5 voltas: depois disso o círculo só se repete por cima.
    maxLength: 3.2,
  });
  return { helix, energyFraction };
}

/** Pontos do caminho inteiro, do canhão ao fim, a cada `angleStep` rad. */
export function pathPoints(path: ElectronPath, angleStep = (4 * Math.PI) / 180): Float32Array {
  const { helix } = path;
  const helical = helix.sine.some((value) => value !== 0) || helix.cosine.some((value) => value !== 0);
  const step = helical ? angleStep : 0.01 / helix.lengthPerUnit;
  const points: number[] = [NOZZLE_X, BEAM_Y, 0];
  for (let s = 0; s < helix.end; s += step) points.push(...helixPoint(helix, s));
  points.push(...helixPoint(helix, helix.end));
  return new Float32Array(points);
}

/** Frações de energia dos elétrons desenhados. */
export function energySamples(state: Readonly<MagneticState>): number[] {
  if (state.spread === 'none') return [1];
  const { min, max } = DEFAULT_MAGNETIC.spread;
  const count = 5;
  return Array.from({ length: count }, (_, i) => min + ((max - min) * i) / (count - 1));
}
