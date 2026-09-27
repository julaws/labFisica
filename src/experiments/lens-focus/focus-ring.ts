import { FOCUS_RANGE_MM } from '../../optics/constants';
import { clamp } from '../../optics/units';

/**
 * Mapa entre o ângulo do anel de foco e a distância de foco (SPEC §6.3).
 *
 * A escala é **logarítmica**, como num anel de verdade: perto do mínimo cada
 * grau vale poucos milímetros, perto do infinito vale metros. O mesmo mapa é
 * usado em três lugares — o arraste do anel, a textura gravada e o slider do
 * painel — justamente para que a marca gravada coincida com o valor mostrado
 * (critério de aceite da F3).
 */

/** Curso total do anel, em radianos (270°, como numa objetiva manual). */
export const RING_SWEEP = (270 * Math.PI) / 180;

/**
 * Fração do curso reservada ao infinito. Depois dela, o anel bate no fim e a
 * distância vale `Infinity`.
 */
const INFINITY_BAND = 0.08;

const LOG_MIN = Math.log(FOCUS_RANGE_MM.min);
const LOG_MAX = Math.log(FOCUS_RANGE_MM.max);

/** Posição normalizada no anel (0 = mínima distância, 1 = infinito). */
export function distanceToRingFraction(millimeters: number): number {
  if (!Number.isFinite(millimeters)) return 1;

  const clamped = clamp(millimeters, FOCUS_RANGE_MM.min, FOCUS_RANGE_MM.max);
  const t = (Math.log(clamped) - LOG_MIN) / (LOG_MAX - LOG_MIN);
  return t * (1 - INFINITY_BAND);
}

/** Inverso de `distanceToRingFraction`. */
export function ringFractionToDistance(fraction: number): number {
  const t = clamp(fraction, 0, 1);
  // Estritamente maior: a fração 1 − INFINITY_BAND é a distância máxima
  // gravada no anel, não o infinito.
  if (t > 1 - INFINITY_BAND) return Infinity;

  const normalized = t / (1 - INFINITY_BAND);
  return Math.exp(LOG_MIN + normalized * (LOG_MAX - LOG_MIN));
}

/** Ângulo do anel, em radianos, para uma distância de foco. */
export function distanceToRingAngle(millimeters: number): number {
  return -distanceToRingFraction(millimeters) * RING_SWEEP;
}

/** Distância de foco para um ângulo do anel. */
export function ringAngleToDistance(angle: number): number {
  return ringFractionToDistance(-angle / RING_SWEEP);
}

/** Marcas gravadas no anel, em metros (SPEC §6.4). */
export const METER_MARKS = [0.3, 0.4, 0.5, 0.7, 1, 1.5, 2, 3, 5, 10] as const;

/** Marcas em pés, a outra escala gravada. */
export const FEET_MARKS = [1, 1.5, 2, 3, 5, 7, 10, 15, 30] as const;

export const FEET_PER_METER = 3.280839895;

export interface RingMark {
  /** Posição normalizada no anel. */
  readonly fraction: number;
  readonly label: string;
  readonly unit: 'm' | 'ft';
}

/** Marcas com a posição já calculada pelo mesmo mapa do arraste. */
export function ringMarks(): RingMark[] {
  const marks: RingMark[] = [];

  for (const meters of METER_MARKS) {
    marks.push({
      fraction: distanceToRingFraction(meters * 1000),
      label: formatMark(meters),
      unit: 'm',
    });
  }

  marks.push({ fraction: 1, label: '∞', unit: 'm' });

  for (const feet of FEET_MARKS) {
    const millimeters = (feet / FEET_PER_METER) * 1000;
    if (millimeters < FOCUS_RANGE_MM.min || millimeters > FOCUS_RANGE_MM.max) continue;
    marks.push({
      fraction: distanceToRingFraction(millimeters),
      label: formatMark(feet),
      unit: 'ft',
    });
  }

  return marks;
}

/** Números com vírgula decimal, como manda a SPEC §6.7. */
function formatMark(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}
