/**
 * Figuras de Chladni (ADR 0018): modos de vibração de uma placa e a areia que
 * se junta nas linhas nodais.
 *
 * TypeScript puro, unidades SI. Coordenadas da placa centradas: x, y de −L/2 a
 * L/2 (quadrada) ou r ≤ a (circular).
 *
 * ## O modelo idealizado (declarado na interface)
 *
 * **Placa quadrada**, lado L: as autofunções aproximadas de Chladni e Rayleigh
 *
 *     u_nm(x, y) = cos(nπX/L)·cos(mπY/L) − cos(mπX/L)·cos(nπY/L),  X = x + L/2,
 *
 * com borda livre de inclinação (∂u/∂n = 0), n ≠ m. Trocar n e m só troca o
 * sinal: (n, m) e (m, n) são o mesmo desenho. Satisfazem ∇²u = −k²u com
 * k² = (π/L)²(n² + m²), logo também a equação da placa fina, ∇⁴u = k⁴u.
 *
 * **Placa circular**, raio a: u = J_n(kr)·cos(nθ), com a borda nodal
 * (J_n(ka) = 0): k = j_{n,s}/a, n diâmetros nodais e s círculos nodais
 * contando a borda.
 *
 * **Frequências** da placa fina de Kirchhoff: ω = k²·√(D/(ρh)), com a rigidez
 * D = E·h³/(12(1 − ν²)). Para o aço (E = 200 GPa, ρ = 7850 kg/m³, ν = 0,29)
 * de 0,8 mm e 24 cm de lado, f_nm ≈ 33,2·(n² + m²) Hz.
 *
 * **Resposta forçada**: cada modo é um oscilador amortecido com fator de
 * qualidade Q, todos excitados com a mesma força (simplificação: na placa de
 * verdade o ponto de excitação pesa cada modo). Na ressonância um modo domina
 * e o desenho é limpo; entre ressonâncias, vários modos fracos e fora de fase
 * se somam e não há linha nodal nítida.
 *
 * **Areia**: cada grão pula só onde a aceleração da placa passa da gravidade
 * (limiar), com saltos aleatórios proporcionais à amplitude local. Onde a placa
 * quase não se mexe — as linhas nodais —, os grãos param e se acumulam.
 */

// --- Bessel ---------------------------------------------------------------------

/**
 * J_n(x) pela integral de Bessel, J_n(x) = (1/π)∫₀^π cos(nτ − x·sen τ) dτ,
 * pela regra do trapézio: o integrando é periódico e analítico, e o erro cai
 * exponencialmente com o número de pontos.
 */
export function besselJ(n: number, x: number): number {
  const points = Math.max(64, Math.ceil(Math.abs(x) + n + 40));
  let sum = 0;
  for (let i = 0; i <= points; i += 1) {
    const tau = (Math.PI * i) / points;
    const weight = i === 0 || i === points ? 0.5 : 1;
    sum += weight * Math.cos(n * tau - x * Math.sin(tau));
  }
  return sum / points;
}

/** Os primeiros `count` zeros positivos de J_n, por varredura e bissecção. */
export function besselZeros(n: number, count: number): number[] {
  const zeros: number[] = [];
  const step = 0.05;
  let x = n === 0 ? step : n + step;
  let previous = besselJ(n, x);
  while (zeros.length < count) {
    const next = x + step;
    const value = besselJ(n, next);
    if (previous === 0 || previous * value < 0) {
      let lo = x;
      let hi = next;
      let flo = previous;
      for (let i = 0; i < 60; i += 1) {
        const mid = 0.5 * (lo + hi);
        const fm = besselJ(n, mid);
        if (flo * fm <= 0) hi = mid;
        else {
          lo = mid;
          flo = fm;
        }
      }
      zeros.push(0.5 * (lo + hi));
    }
    x = next;
    previous = value;
  }
  return zeros;
}

// --- A placa --------------------------------------------------------------------

export type PlateShape = 'square' | 'circle';

export interface PlateMaterial {
  /** Módulo de Young, Pa; densidade, kg/m³; coeficiente de Poisson. */
  readonly young: number;
  readonly density: number;
  readonly poisson: number;
}

export const STEEL: PlateMaterial = { young: 200e9, density: 7850, poisson: 0.29 };

export interface Plate {
  readonly shape: PlateShape;
  /** Lado (quadrada) ou raio (circular), m. */
  readonly size: number;
  /** Espessura, m. */
  readonly thickness: number;
  readonly material: PlateMaterial;
}

export const SQUARE_PLATE: Plate = { shape: 'square', size: 0.24, thickness: 0.8e-3, material: STEEL };
export const CIRCLE_PLATE: Plate = { shape: 'circle', size: 0.12, thickness: 0.8e-3, material: STEEL };

/** √(D/(ρh)), m²/s: liga o número de onda à frequência, ω = k²·√(D/ρh). */
export function plateStiffness(plate: Plate): number {
  const { young, density, poisson } = plate.material;
  return plate.thickness * Math.sqrt(young / (12 * density * (1 - poisson * poisson)));
}

export interface PlateMode {
  readonly shape: PlateShape;
  /** Quadrada: os índices (n, m), n < m. Circular: n diâmetros, m = s círculos (com a borda). */
  readonly n: number;
  readonly m: number;
  /** Número de onda, 1/m, e frequência própria, Hz. */
  readonly k: number;
  readonly frequency: number;
  /** Fator que leva o máximo de |u| na placa a 1. */
  readonly norm: number;
}

/** Autofunção da placa quadrada, sem normalização. x, y centrados. */
export function squareShape(n: number, m: number, x: number, y: number, side: number): number {
  const X = (Math.PI * (x + side / 2)) / side;
  const Y = (Math.PI * (y + side / 2)) / side;
  return Math.cos(n * X) * Math.cos(m * Y) - Math.cos(m * X) * Math.cos(n * Y);
}

/**
 * Tabelas de J_n(k·r) para a placa circular: avaliar Bessel milhares de vezes
 * por quadro sairia caro, então cada modo guarda 1024 amostras ao longo do raio.
 */
const besselTables = new Map<string, Float64Array>();
const TABLE_SIZE = 1024;

function besselTable(n: number, ka: number): Float64Array {
  const key = `${n}|${ka.toFixed(9)}`;
  let table = besselTables.get(key);
  if (!table) {
    table = new Float64Array(TABLE_SIZE + 1);
    for (let i = 0; i <= TABLE_SIZE; i += 1) table[i] = besselJ(n, (ka * i) / TABLE_SIZE);
    besselTables.set(key, table);
  }
  return table;
}

/** Autofunção da placa circular J_n(kr)·cos(nθ), sem normalização. Zero fora da placa. */
export function circleShape(n: number, k: number, x: number, y: number, radius: number): number {
  const r = Math.hypot(x, y);
  if (r > radius) return 0;
  const table = besselTable(n, k * radius);
  const t = (r / radius) * TABLE_SIZE;
  const i = Math.min(Math.floor(t), TABLE_SIZE - 1);
  const f = t - i;
  const radial = table[i]! * (1 - f) + table[i + 1]! * f;
  return n === 0 ? radial : radial * Math.cos(n * Math.atan2(y, x));
}

/** Forma do modo normalizada (máximo de |u| = 1). */
export function modeShape(mode: PlateMode, x: number, y: number, size: number): number {
  const raw =
    mode.shape === 'square' ? squareShape(mode.n, mode.m, x, y, size) : circleShape(mode.n, mode.k, x, y, size);
  return raw * mode.norm;
}

function normalize(shape: PlateShape, n: number, m: number, k: number, size: number): number {
  let max = 0;
  const steps = 96;
  for (let j = 0; j <= steps; j += 1) {
    for (let i = 0; i <= steps; i += 1) {
      const x = (i / steps - 0.5) * size * (shape === 'square' ? 1 : 2);
      const y = (j / steps - 0.5) * size * (shape === 'square' ? 1 : 2);
      const value =
        shape === 'square' ? squareShape(n, m, x, y, size) : circleShape(n, k, x, y, size);
      max = Math.max(max, Math.abs(value));
    }
  }
  return max > 0 ? 1 / max : 1;
}

/** Modos da placa até `maxFrequency`, em ordem de frequência. */
export function plateModes(plate: Plate, maxFrequency: number): PlateMode[] {
  const stiffness = plateStiffness(plate);
  const toFrequency = (k: number): number => (k * k * stiffness) / (2 * Math.PI);
  const modes: PlateMode[] = [];
  if (plate.shape === 'square') {
    for (let m = 1; m <= 40; m += 1) {
      for (let n = 0; n < m; n += 1) {
        const k = (Math.PI / plate.size) * Math.sqrt(n * n + m * m);
        const frequency = toFrequency(k);
        if (frequency > maxFrequency) continue;
        modes.push({ shape: 'square', n, m, k, frequency, norm: normalize('square', n, m, k, plate.size) });
      }
    }
  } else {
    for (let n = 0; n <= 12; n += 1) {
      const zeros = besselZeros(n, 8);
      zeros.forEach((zero, index) => {
        const k = zero / plate.size;
        const frequency = toFrequency(k);
        if (frequency > maxFrequency) return;
        modes.push({ shape: 'circle', n, m: index + 1, k, frequency, norm: normalize('circle', n, index + 1, k, plate.size) });
      });
    }
  }
  return modes.sort((a, b) => a.frequency - b.frequency);
}

/** Frequência do modo (n, m) da placa quadrada, Hz: 33,2·(n² + m²) no padrão. */
export function squareModeFrequency(plate: Plate, n: number, m: number): number {
  const k2 = (Math.PI / plate.size) ** 2 * (n * n + m * m);
  return (k2 * plateStiffness(plate)) / (2 * Math.PI);
}

// --- Resposta forçada ----------------------------------------------------------------

export interface ModeResponse {
  readonly mode: PlateMode;
  /** Amplitude complexa, já dividida por Q: vale 1 na ressonância exata. */
  readonly re: number;
  readonly im: number;
}

export interface PlateResponse {
  readonly frequency: number;
  readonly modes: readonly ModeResponse[];
  /** O modo de maior amplitude e a amplitude dele (0 a 1). */
  readonly dominant: PlateMode | null;
  readonly strength: number;
  /** Em ressonância: o modo dominante tem pelo menos metade da amplitude de pico. */
  readonly resonant: boolean;
}

/** Fator de qualidade padrão: a meia largura da ressonância é f/(2Q). */
export const DEFAULT_Q = 60;

/**
 * Oscilador amortecido forçado: a/Q = 1/(Q·(1 − r² + i·r/Q)), r = f/f₀. Os
 * modos com amplitude desprezível ficam de fora.
 */
export function plateResponse(modes: readonly PlateMode[], frequency: number, q = DEFAULT_Q): PlateResponse {
  const responses: ModeResponse[] = [];
  let dominant: PlateMode | null = null;
  let strength = 0;
  for (const mode of modes) {
    const r = frequency / mode.frequency;
    const a = 1 - r * r;
    const b = r / q;
    const d = q * (a * a + b * b);
    const re = a / d;
    const im = -b / d;
    const amplitude = Math.hypot(re, im);
    if (amplitude < 0.004) continue;
    responses.push({ mode, re, im });
    if (amplitude > strength) {
      strength = amplitude;
      dominant = mode;
    }
  }
  return { frequency, modes: responses, dominant, strength, resonant: strength >= 0.5 };
}

/** Deslocamento complexo da placa no ponto (x, y): Σ aₖ·φₖ(x, y). */
export function displacement(response: PlateResponse, x: number, y: number, size: number): { re: number; im: number } {
  let re = 0;
  let im = 0;
  for (const { mode, re: a, im: b } of response.modes) {
    const phi = modeShape(mode, x, y, size);
    re += a * phi;
    im += b * phi;
  }
  return { re, im };
}

/** Amplitude da vibração no ponto (o envelope do movimento harmônico). */
export function amplitude(response: PlateResponse, x: number, y: number, size: number): number {
  const { re, im } = displacement(response, x, y, size);
  return Math.hypot(re, im);
}

/**
 * A vibração da placa numa grade (re, im do deslocamento e a amplitude), com
 * leitura bilinear: a areia e o desenho da placa consultam a grade, não a soma
 * dos modos, milhares de vezes por quadro.
 */
export interface PlateField {
  readonly resolution: number;
  /** Meia largura da grade, m (a placa quadrada vai de −half a half). */
  readonly half: number;
  readonly re: Float32Array;
  readonly im: Float32Array;
  readonly amplitude: Float32Array;
  /** Amplitude no ponto (x, y), interpolada. */
  readonly amplitudeAt: (x: number, y: number) => number;
  /** Deslocamento no instante de fase ωt, interpolado. */
  readonly displacementAt: (x: number, y: number, phase: number) => number;
}

export function plateField(
  response: PlateResponse,
  plate: Pick<Plate, 'shape' | 'size'>,
  resolution = 128,
): PlateField {
  const half = plate.shape === 'square' ? plate.size / 2 : plate.size;
  const n = resolution + 1;
  const re = new Float32Array(n * n);
  const im = new Float32Array(n * n);
  const amp = new Float32Array(n * n);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const x = (i / resolution) * 2 * half - half;
      const y = (j / resolution) * 2 * half - half;
      const value = displacement(response, x, y, plate.size);
      re[j * n + i] = value.re;
      im[j * n + i] = value.im;
      amp[j * n + i] = Math.hypot(value.re, value.im);
    }
  }
  const sample = (grid: Float32Array, x: number, y: number): number => {
    const u = Math.min(Math.max(((x + half) / (2 * half)) * resolution, 0), resolution - 1e-6);
    const v = Math.min(Math.max(((y + half) / (2 * half)) * resolution, 0), resolution - 1e-6);
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fu = u - i;
    const fv = v - j;
    const k = j * n + i;
    return (
      grid[k]! * (1 - fu) * (1 - fv) +
      grid[k + 1]! * fu * (1 - fv) +
      grid[k + n]! * (1 - fu) * fv +
      grid[k + n + 1]! * fu * fv
    );
  };
  return {
    resolution,
    half,
    re,
    im,
    amplitude: amp,
    amplitudeAt: (x, y) => sample(amp, x, y),
    displacementAt: (x, y, phase) => sample(re, x, y) * Math.cos(phase) - sample(im, x, y) * Math.sin(phase),
  };
}

/**
 * Linhas nodais de um modo da placa quadrada que chegam à borda: metade das
 * trocas de sinal de u ao longo do perímetro (cada linha toca a borda duas
 * vezes). Na circular: n diâmetros e m − 1 círculos dentro, além da borda.
 */
export function nodalLineCount(mode: PlateMode, size: number): number {
  if (mode.shape === 'circle') return mode.n + (mode.m - 1);
  const samples = 4000;
  const h = size / 2;
  let changes = 0;
  let previous = 0;
  for (let i = 0; i <= samples; i += 1) {
    const t = (i / samples) * 4;
    const side = Math.min(Math.floor(t), 3);
    const s = (t - side) * size - h;
    const [x, y] = side === 0 ? [s, -h] : side === 1 ? [h, s] : side === 2 ? [-s, h] : [-h, -s];
    // Desloca de leve para dentro: nos cantos o modo pode zerar exatamente.
    const value = squareShape(mode.n, mode.m, x * 0.999, y * 0.999, size);
    if (Math.abs(value) < 1e-9) continue;
    if (previous !== 0 && Math.sign(value) !== Math.sign(previous)) changes += 1;
    previous = value;
  }
  return Math.round(changes / 2);
}

// --- Areia ---------------------------------------------------------------------------

export interface SandOptions {
  /** Abaixo desta amplitude (fração da de pico) o grão não pula: a placa acelera menos que g. */
  readonly threshold?: number;
  /** Tamanho típico de um salto com amplitude 1, em frações do tamanho da placa. */
  readonly hop?: number;
}

/**
 * Um passo da areia: cada grão, onde a amplitude local A passa do limiar, dá
 * um salto aleatório (gaussiano) proporcional a A − limiar. Bate na borda e
 * volta. `positions` guarda x, y intercalados; `amplitudeAt` dá A num ponto.
 */
export function stepSand(
  positions: Float32Array,
  amplitudeAt: (x: number, y: number) => number,
  plate: Pick<Plate, 'shape' | 'size'>,
  random: () => number,
  { threshold = 0.1, hop = 0.03 }: SandOptions = {},
): void {
  const half = plate.shape === 'square' ? plate.size / 2 : plate.size;
  const scale = hop * (plate.shape === 'square' ? plate.size : 2 * plate.size);
  for (let i = 0; i < positions.length; i += 2) {
    const x = positions[i]!;
    const y = positions[i + 1]!;
    const excess = amplitudeAt(x, y) - threshold;
    if (excess <= 0) continue;
    // Box–Muller: dois gaussianos independentes.
    const u1 = Math.max(random(), 1e-12);
    const u2 = random();
    const radius = Math.sqrt(-2 * Math.log(u1)) * scale * excess;
    let nx = x + radius * Math.cos(2 * Math.PI * u2);
    let ny = y + radius * Math.sin(2 * Math.PI * u2);
    if (plate.shape === 'square') {
      if (nx > half) nx = 2 * half - nx;
      if (nx < -half) nx = -2 * half - nx;
      if (ny > half) ny = 2 * half - ny;
      if (ny < -half) ny = -2 * half - ny;
      nx = Math.min(Math.max(nx, -half), half);
      ny = Math.min(Math.max(ny, -half), half);
    } else {
      const r = Math.hypot(nx, ny);
      if (r > half) {
        // Reflete para dentro do círculo.
        const back = (2 * half - r) / r;
        nx *= back;
        ny *= back;
      }
    }
    positions[i] = nx;
    positions[i + 1] = ny;
  }
}

/** Espalha `count` grãos uniformemente sobre a placa. */
export function scatterSand(
  count: number,
  plate: Pick<Plate, 'shape' | 'size'>,
  random: () => number,
): Float32Array<ArrayBuffer> {
  const positions = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 1) {
    if (plate.shape === 'square') {
      positions[2 * i] = (random() - 0.5) * plate.size;
      positions[2 * i + 1] = (random() - 0.5) * plate.size;
    } else {
      const r = plate.size * Math.sqrt(random());
      const a = 2 * Math.PI * random();
      positions[2 * i] = r * Math.cos(a);
      positions[2 * i + 1] = r * Math.sin(a);
    }
  }
  return positions;
}

/** Gerador pseudoaleatório determinístico (mulberry32), para testes e capturas. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
