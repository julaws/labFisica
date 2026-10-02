/**
 * Dupla fenda com elétrons (ADR 0009): comprimento de onda de de Broglie e
 * difração de Fresnel de fendas retangulares longas.
 *
 * TypeScript puro, unidades SI (metros, volts). O experimento converte para
 * micrômetros e milímetros só na hora de mostrar.
 *
 * ## O modelo
 *
 * Feixe plano e coerente chega às fendas, que são longas na vertical (o
 * problema é unidimensional, em x). Na aproximação paraxial de Fresnel, a
 * amplitude num ponto X do anteparo, a uma distância L, vinda de uma fenda que
 * vai de x₁ a x₂, é
 *
 *     U(X) = (1/√2)·{ [C(w₂) − C(w₁)] + i·[S(w₂) − S(w₁)] },
 *     w = (x − X)·√(2/(λL)),
 *
 * com C e S as integrais de Fresnel. A normalização faz uma abertura infinita
 * dar |U| = 1. Ela vale perto (Fresnel) e longe (Fraunhofer) das fendas, e é
 * isso que permite mostrar as duas faixas com o detector ligado (ver ADR).
 *
 * ## O que o detector faz
 *
 * - Sem detector, não há informação de caminho: as amplitudes somam e
 *   interferem, I = |U₁ + U₂|².
 * - Com detector, cada elétron é registrado numa fenda: as probabilidades
 *   somam, I = |U₁|² + |U₂|², e o termo de interferência some.
 */

/** Constantes CODATA 2018 (h, e e c são exatas desde 2019). */
export const PLANCK = 6.62607015e-34; // J·s
export const ELEMENTARY_CHARGE = 1.602176634e-19; // C
export const ELECTRON_MASS = 9.1093837015e-31; // kg
export const SPEED_OF_LIGHT = 299_792_458; // m/s

/**
 * Comprimento de onda de de Broglie de um elétron acelerado por `voltage`
 * volts, com a correção relativística do momento:
 *
 *     p = √(2·m·e·V·(1 + e·V / (2·m·c²))),   λ = h / p.
 */
export function electronWavelength(voltage: number): number {
  const energy = ELEMENTARY_CHARGE * voltage;
  const rest = ELECTRON_MASS * SPEED_OF_LIGHT * SPEED_OF_LIGHT;
  const momentum = Math.sqrt(2 * ELECTRON_MASS * energy * (1 + energy / (2 * rest)));
  return PLANCK / momentum;
}

/** Velocidade do elétron acelerado por `voltage` volts, como fração de c. */
export function electronSpeedFraction(voltage: number): number {
  const gamma = 1 + (ELEMENTARY_CHARGE * voltage) / (ELECTRON_MASS * SPEED_OF_LIGHT * SPEED_OF_LIGHT);
  return Math.sqrt(1 - 1 / (gamma * gamma));
}

// --- Integrais de Fresnel -----------------------------------------------------

/** Até onde a tabela vai; além disso usa a expansão assintótica. */
const TABLE_LIMIT = 8;
const TABLE_STEP = 1 / 2000;
let table: { c: Float64Array; s: Float64Array } | null = null;

/**
 * Tabela de C e S de 0 a `TABLE_LIMIT`, por integração cumulativa de Simpson
 * em passos de 1/2000. Calculada uma vez, na primeira chamada.
 */
function fresnelTable(): { c: Float64Array; s: Float64Array } {
  if (table) return table;
  const count = Math.round(TABLE_LIMIT / TABLE_STEP) + 1;
  const c = new Float64Array(count);
  const s = new Float64Array(count);
  const h = TABLE_STEP;
  for (let i = 1; i < count; i += 1) {
    const a = (i - 1) * h;
    const m = a + h / 2;
    const b = i * h;
    const fc = (t: number): number => Math.cos((Math.PI * t * t) / 2);
    const fs = (t: number): number => Math.sin((Math.PI * t * t) / 2);
    c[i] = c[i - 1]! + (h / 6) * (fc(a) + 4 * fc(m) + fc(b));
    s[i] = s[i - 1]! + (h / 6) * (fs(a) + 4 * fs(m) + fs(b));
  }
  table = { c, s };
  return table;
}

/**
 * Integrais de Fresnel C(x) = ∫₀ˣ cos(πt²/2) dt e S(x) = ∫₀ˣ sin(πt²/2) dt.
 * Ímpares em x. Tabela com interpolação linear até 8; acima disso, a expansão
 * assintótica com as funções auxiliares f e g (Abramowitz e Stegun, 7.3.27–28).
 */
export function fresnelIntegrals(x: number): { c: number; s: number } {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);

  if (ax <= TABLE_LIMIT) {
    const { c, s } = fresnelTable();
    const position = ax / TABLE_STEP;
    const i = Math.min(Math.floor(position), c.length - 2);
    const frac = position - i;
    return {
      c: sign * (c[i]! + (c[i + 1]! - c[i]!) * frac),
      s: sign * (s[i]! + (s[i + 1]! - s[i]!) * frac),
    };
  }

  // f(x) ≈ 1/(πx)·(1 − 3/(πx²)²), g(x) ≈ 1/(π²x³)·(1 − 15/(πx²)²)
  const z = Math.PI * ax * ax;
  const f = (1 / (Math.PI * ax)) * (1 - 3 / (z * z));
  const g = (1 / (Math.PI * Math.PI * ax * ax * ax)) * (1 - 15 / (z * z));
  const phase = (Math.PI * ax * ax) / 2;
  return {
    c: sign * (0.5 + f * Math.sin(phase) - g * Math.cos(phase)),
    s: sign * (0.5 - f * Math.cos(phase) - g * Math.sin(phase)),
  };
}

// --- Padrão no anteparo -------------------------------------------------------

export interface DoubleSlitGeometry {
  /** Comprimento de onda, m. */
  readonly wavelength: number;
  /** Largura de cada fenda, m. */
  readonly slitWidth: number;
  /** Distância entre os centros das fendas, m. */
  readonly separation: number;
  /** Distância das fendas ao anteparo, m. */
  readonly distance: number;
}

export interface SlitState {
  readonly left: boolean;
  readonly right: boolean;
  /** Detectores ligados: há informação de caminho e a interferência some. */
  readonly detectors: boolean;
}

/** Amplitude complexa de uma fenda em X, normalizada (abertura infinita = 1). */
export function slitAmplitude(
  geometry: DoubleSlitGeometry,
  center: number,
  X: number,
): { re: number; im: number } {
  const scale = Math.sqrt(2 / (geometry.wavelength * geometry.distance));
  const w1 = (center - geometry.slitWidth / 2 - X) * scale;
  const w2 = (center + geometry.slitWidth / 2 - X) * scale;
  const a = fresnelIntegrals(w1);
  const b = fresnelIntegrals(w2);
  return { re: (b.c - a.c) / Math.SQRT2, im: (b.s - a.s) / Math.SQRT2 };
}

/**
 * Intensidade no anteparo em cada posição de `positions` (m), relativa à de
 * um feixe livre (abertura infinita = 1).
 */
export function screenIntensity(
  geometry: DoubleSlitGeometry,
  state: SlitState,
  positions: ArrayLike<number>,
): Float64Array {
  const out = new Float64Array(positions.length);
  const half = geometry.separation / 2;
  for (let i = 0; i < positions.length; i += 1) {
    const X = positions[i]!;
    const left = state.left ? slitAmplitude(geometry, -half, X) : { re: 0, im: 0 };
    const right = state.right ? slitAmplitude(geometry, half, X) : { re: 0, im: 0 };
    out[i] = state.detectors
      ? left.re * left.re + left.im * left.im + right.re * right.re + right.im * right.im
      : (left.re + right.re) ** 2 + (left.im + right.im) ** 2;
  }
  return out;
}

/** Espaçamento das franjas no limite de Fraunhofer, Δy = λL/d, m. */
export function fringeSpacing(geometry: DoubleSlitGeometry): number {
  return (geometry.wavelength * geometry.distance) / geometry.separation;
}

/** Número de Fresnel de uma fenda, a²/(λL): ≫ 1 perto, ≪ 1 longe. */
export function fresnelNumber(geometry: DoubleSlitGeometry): number {
  return (geometry.slitWidth * geometry.slitWidth) / (geometry.wavelength * geometry.distance);
}

/**
 * Sorteia uma posição no anteparo com probabilidade proporcional à
 * intensidade: é onde cada elétron cai. `random` em [0, 1).
 */
export function sampleFromPattern(
  positions: ArrayLike<number>,
  intensity: ArrayLike<number>,
  random: number,
): number {
  let total = 0;
  for (let i = 0; i < intensity.length; i += 1) total += intensity[i]!;
  if (total <= 0) return Number.NaN;
  let target = random * total;
  for (let i = 0; i < intensity.length; i += 1) {
    target -= intensity[i]!;
    if (target <= 0) return positions[i]!;
  }
  return positions[positions.length - 1]!;
}

/**
 * Quantos máximos locais o padrão tem acima de `threshold` vezes o maior
 * valor: são as franjas (ou faixas) que se veem no anteparo.
 */
export function countMaxima(intensity: ArrayLike<number>, threshold = 0.15): number {
  let peak = 0;
  for (let i = 0; i < intensity.length; i += 1) peak = Math.max(peak, intensity[i]!);
  if (peak <= 0) return 0;
  let count = 0;
  for (let i = 1; i < intensity.length - 1; i += 1) {
    const value = intensity[i]!;
    if (value >= threshold * peak && value > intensity[i - 1]! && value >= intensity[i + 1]!) count += 1;
  }
  return count;
}

/** Geometria padrão do experimento (ADR 0009). */
export const DEFAULT_DOUBLE_SLIT = {
  /** Tensão de aceleração, V: a do experimento de Jönsson (1961). */
  voltage: 50_000,
  slitWidth: 1.2e-6,
  separation: 8e-6,
  distance: 1.4,
  /** Faixa da distância ao anteparo, m. */
  distanceRange: { min: 1.0, max: 1.8 },
  /** Largura física do anteparo, m (o campo que ele captura). */
  screenWidth: 36e-6,
  screenWidthRange: { min: 24e-6, max: 48e-6 },
} as const;
