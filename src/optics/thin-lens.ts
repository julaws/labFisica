/**
 * Modelo de lente fina (SPEC §5.2). É daqui que saem **todos** os números
 * mostrados na interface.
 *
 * Convenções (SPEC §5.1, detalhadas em docs/optics-sources.md):
 * - o objeto fica à esquerda e a luz se propaga no sentido +z;
 * - `u` (distância do objeto) e `v` (distância da imagem) são **positivas**
 *   no caso real, medidas a partir da lente;
 * - tudo em milímetros.
 */

export interface ThinLensState {
  /** Distância focal, mm. */
  f: number;
  /** Número f (abertura relativa), adimensional. */
  N: number;
  /** Distância de foco, mm. */
  focusDistance: number;
  /** Círculo de confusão admissível, mm. */
  coc: number;
  /** Sensor, mm. */
  sensor: { w: number; h: number };
}

export type ConvergenceSide = 'front' | 'on' | 'behind';

export interface Convergence {
  /** Distância atrás da lente onde os raios do objeto se encontram, mm. */
  v: number;
  /** Onde isso acontece em relação ao plano da imagem. */
  side: ConvergenceSide;
  /** v_d − v_s, mm: com sinal, positivo = converge atrás do sensor. */
  offset: number;
}

export interface DofLimits {
  /** Limite próximo da zona nítida, mm. */
  near: number;
  /** Limite distante, `Infinity` quando o foco alcança a hiperfocal. */
  far: number;
  /** Profundidade total, `Infinity` quando `far` é infinito. */
  total: number;
}

/**
 * Distância da imagem: 1/f = 1/u + 1/v → v = f·u / (u − f).
 *
 * - `u = Infinity` devolve `f` (objeto no infinito);
 * - `u = f` devolve `Infinity` (os raios saem paralelos);
 * - `u < f` devolve valor negativo: imagem virtual, do mesmo lado do objeto.
 */
export function imageDistance(f: number, u: number): number {
  if (!Number.isFinite(u)) return f;
  if (u === f) return Infinity;
  return (f * u) / (u - f);
}

/** Extensão do foco: quanto a lente precisa avançar além de f, mm. */
export function focusExtension(f: number, u: number): number {
  return imageDistance(f, u) - f;
}

/** Magnificação transversal m = −v/u (negativa = imagem invertida). */
export function magnification(f: number, u: number): number {
  if (!Number.isFinite(u)) return 0;
  return -imageDistance(f, u) / u;
}

/** Diâmetro da pupila de entrada: D = f / N, mm. */
export function pupilDiameter(f: number, N: number): number {
  return f / N;
}

/**
 * Distância hiperfocal: H = f² / (N·c) + f, mm.
 * Focando em H, a zona nítida vai de H/2 até o infinito.
 */
export function hyperfocal(f: number, N: number, c: number): number {
  return (f * f) / (N * c) + f;
}

/**
 * Limites da zona nítida para foco em `s`:
 *
 *     Dn = s·(H − f) / (H + s − 2f)
 *     Df = s·(H − f) / (H − s)      (infinito quando s ≥ H)
 */
export function dofLimits(f: number, N: number, c: number, s: number): DofLimits {
  const H = hyperfocal(f, N, c);

  if (!Number.isFinite(s)) {
    return { near: H, far: Infinity, total: Infinity };
  }

  const near = (s * (H - f)) / (H + s - 2 * f);

  if (s >= H) {
    return { near, far: Infinity, total: Infinity };
  }

  const far = (s * (H - f)) / (H - s);
  return { near, far, total: far - near };
}

/**
 * Diâmetro do círculo de confusão no sensor, em mm, para um objeto a `d`
 * quando o foco está em `s`:
 *
 *     b(d) = f² / (N·(s − f)) · |d − s| / d
 *
 * Para `d = Infinity` o segundo fator tende a 1.
 */
export function blurDiameter(f: number, N: number, s: number, d: number): number {
  if (d === 0) return Infinity;

  // Foco no infinito: a forma geral vira 0 · ∞. O limite é
  //   b = D · |v_d − f| / v_d = (f/N) · (f/d) = f² / (N·d)
  // e é ele que dá os "3,4 mm" do pinheiro na frase da SPEC §6.7.
  if (!Number.isFinite(s)) {
    return Number.isFinite(d) ? (f * f) / (N * d) : 0;
  }

  const scale = (f * f) / (N * (s - f));
  if (!Number.isFinite(d)) return scale;
  return (scale * Math.abs(d - s)) / d;
}

/**
 * Onde os raios de um objeto a `d` se encontram atrás da lente, comparado ao
 * plano da imagem (que está em v_s, o conjugado da distância de foco `s`).
 *
 * `behind` = converge atrás do sensor (objeto mais perto que o foco);
 * `front`  = converge à frente do sensor (objeto mais longe que o foco).
 */
export function convergence(f: number, s: number, d: number, tolerance = 1e-9): Convergence {
  const vs = imageDistance(f, s);
  const vd = imageDistance(f, d);
  const offset = vd - vs;

  const side: ConvergenceSide =
    Math.abs(offset) <= tolerance ? 'on' : offset > 0 ? 'behind' : 'front';

  return { v: vd, side, offset };
}

/**
 * Meia-largura angular do campo coberto pelo sensor, em radianos,
 * usada para derivar o FOV da câmera virtual (SPEC §6.6).
 */
export function halfFieldAngle(f: number, u: number, sensorDimension: number): number {
  const v = Number.isFinite(imageDistance(f, u)) ? imageDistance(f, u) : f;
  return Math.atan(sensorDimension / 2 / v);
}
