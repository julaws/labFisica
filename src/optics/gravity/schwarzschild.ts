/**
 * Luz em volta de um buraco negro de Schwarzschild (ADR 0017).
 *
 * TypeScript puro. Por dentro, **unidades geométricas** G = c = 1 e
 * comprimentos em unidades da massa M (M = GM/c², o "raio gravitacional"):
 * o horizonte fica em r = 2, a esfera de fótons em r = 3. A API física
 * (massas em massas solares, distâncias em km) converte nas bordas.
 *
 * ## A órbita da luz
 *
 * Os raios de luz são geodésicas nulas. Cada uma fica num plano que passa
 * pelo centro, e com u = 1/r e o ângulo φ nesse plano:
 *
 *     d²u/dφ² = −u + 3M·u²
 *
 * (Misner, Thorne e Wheeler, *Gravitation*, §25.6). Sem o termo 3Mu², a
 * solução é uma reta, u = sen φ / b. A integral primeira dá a condição de
 * cada raio: (du/dφ)² = 1/b² − u²(1 − 2Mu), com b o parâmetro de impacto.
 *
 * - Raios com b < b_c = 3√3·M caem no horizonte; com b > b_c escapam. O
 *   círculo de raio b_c, visto de longe, é a **sombra** do buraco negro.
 * - Em r = 3M a luz pode orbitar em círculo (instável): a esfera de fótons.
 * - Campo fraco (b ≫ M): deflexão α ≈ 4M/b, a de Einstein (1915), que para a
 *   luz rasante ao Sol dá 1,75″.
 *
 * Integração: Runge–Kutta de 4ª ordem em φ, com o passo encolhendo perto do
 * buraco negro, e a saída (u = 0) achada por Newton sobre o próprio passo.
 */

/** GM☉/c² em km: GM☉ = 1,327 124 4 × 10²⁰ m³/s² (IAU 2015), c exata. */
export const SOLAR_GRAVITATIONAL_RADIUS_KM = 1.3271244e20 / 299_792_458 ** 2 / 1000;

/** Raios notáveis, em unidades de M. */
export const HORIZON_RADIUS = 2;
export const PHOTON_SPHERE_RADIUS = 3;
export const CRITICAL_IMPACT_PARAMETER = 3 * Math.sqrt(3);
/** Órbita circular estável mais interna (borda de dentro do disco), M. */
export const ISCO_RADIUS = 6;

/** Raio gravitacional GM/c² de uma massa dada em massas solares, km. */
export function gravitationalRadiusKm(solarMasses: number): number {
  return solarMasses * SOLAR_GRAVITATIONAL_RADIUS_KM;
}

/** Raio de Schwarzschild 2GM/c², km. */
export function schwarzschildRadiusKm(solarMasses: number): number {
  return 2 * gravitationalRadiusKm(solarMasses);
}

/** Deflexão de campo fraco 4M/b (b em unidades de M), rad. */
export function weakDeflection(b: number): number {
  return 4 / b;
}

/**
 * Raio angular do anel de Einstein no campo fraco, rad:
 * θ_E = √(4GM·D_LS / (c²·D_L·D_S)). Distâncias em unidades de M.
 */
export function einsteinAngleWeak(lensDistance: number, sourceDistance: number, lensSourceDistance: number): number {
  return Math.sqrt((4 * lensSourceDistance) / (lensDistance * sourceDistance));
}

/** O mesmo, com a fonte no infinito (D_LS/D_S → 1): θ_E = √(4M/D_L). */
export function einsteinAngleWeakFar(lensDistance: number): number {
  return Math.sqrt(4 / lensDistance);
}

/**
 * Raio angular da sombra para um observador parado em r (unidades de M), rad
 * (Synge, 1966): sen ψ = b_c·√(1 − 2M/r) / r. Dentro da esfera de fótons a
 * sombra passa da metade do céu: ψ > 90°.
 */
export function shadowAngularRadius(r: number): number {
  const s = Math.min(1, (CRITICAL_IMPACT_PARAMETER * Math.sqrt(Math.max(0, 1 - 2 / r))) / r);
  const angle = Math.asin(s);
  return r < PHOTON_SPHERE_RADIUS ? Math.PI - angle : angle;
}

/**
 * Parâmetro de impacto de um raio que sai de um observador parado em r com
 * ângulo ψ em relação à direção do centro (medido pelo observador).
 */
export function impactParameter(r: number, psi: number): number {
  return (r * Math.abs(Math.sin(psi))) / Math.sqrt(1 - 2 / r);
}

export interface RayResult {
  /** Caiu no horizonte. */
  readonly captured: boolean;
  /**
   * Ângulo φ percorrido até o infinito (escapou), contado a partir do ponto
   * de partida; NaN se foi capturado.
   */
  readonly phiExit: number;
  /** Menor raio alcançado, M. */
  readonly minRadius: number;
  /** Voltas demais em torno da esfera de fótons: classificado como capturado. */
  readonly trapped: boolean;
}

export interface TraceOptions {
  /** Passo máximo em φ, rad. */
  readonly step?: number;
  /** Para de integrar depois de tanto φ (raio preso na esfera de fótons). */
  readonly maxPhi?: number;
  /** Chamada a cada passo, para desenhar a trajetória. */
  readonly onStep?: (phi: number, u: number) => void;
}

const accel = (u: number): number => -u + 3 * u * u;

interface State {
  u: number;
  w: number;
}

function rk4(state: State, h: number): State {
  const { u, w } = state;
  const k1u = w;
  const k1w = accel(u);
  const k2u = w + 0.5 * h * k1w;
  const k2w = accel(u + 0.5 * h * k1u);
  const k3u = w + 0.5 * h * k2w;
  const k3w = accel(u + 0.5 * h * k2u);
  const k4u = w + h * k3w;
  const k4w = accel(u + h * k3u);
  return {
    u: u + (h / 6) * (k1u + 2 * k2u + 2 * k3u + k4u),
    w: w + (h / 6) * (k1w + 2 * k2w + 2 * k3w + k4w),
  };
}

/**
 * Integra d²u/dφ² = −u + 3u² a partir de (u, du/dφ) até o raio escapar
 * (u volta a zero) ou cair no horizonte (u ≥ 1/2).
 */
function integrate(u0: number, w0: number, options: TraceOptions): RayResult {
  const maxStep = options.step ?? 2e-3;
  const maxPhi = options.maxPhi ?? 40 * Math.PI;
  let state: State = { u: u0, w: w0 };
  let phi = 0;
  let maxU = u0;
  options.onStep?.(phi, state.u);
  while (phi < maxPhi) {
    // Passo menor perto do buraco negro, onde a curvatura da órbita é grande.
    const h = maxStep / (1 + 8 * state.u);
    const next = rk4(state, h);
    if (next.u >= 0.5) {
      options.onStep?.(phi + h, 0.5);
      return { captured: true, phiExit: Number.NaN, minRadius: 2, trapped: false };
    }
    if (next.u <= 0 && state.w < 0) {
      // Saída: o passo h* que leva u exatamente a zero, por Newton.
      let hs = -state.u / state.w;
      for (let i = 0; i < 4; i += 1) {
        const trial = rk4(state, hs);
        hs -= trial.u / trial.w;
      }
      options.onStep?.(phi + hs, 0);
      return { captured: false, phiExit: phi + hs, minRadius: 1 / maxU, trapped: false };
    }
    state = next;
    phi += h;
    if (state.u > maxU) maxU = state.u;
    options.onStep?.(phi, state.u);
  }
  return { captured: true, phiExit: Number.NaN, minRadius: 1 / maxU, trapped: true };
}

/** Raio vindo do infinito com parâmetro de impacto b (unidades de M). */
export function traceFromInfinity(b: number, options: TraceOptions = {}): RayResult {
  return integrate(0, 1 / b, options);
}

/**
 * Deflexão total de um raio vindo do infinito, rad: o quanto φ passa de π.
 * NaN se o raio for capturado.
 */
export function deflection(b: number, options: TraceOptions = {}): number {
  const result = traceFromInfinity(b, options);
  return result.captured ? Number.NaN : result.phiExit - Math.PI;
}

/** Captura pelo critério analítico: b < b_c. */
export function isCaptured(b: number): boolean {
  return b < CRITICAL_IMPACT_PARAMETER;
}

/**
 * Raio que sai de um observador parado em r (M), com ângulo ψ (rad) em
 * relação à direção do centro: ψ = 0 mira o buraco negro, ψ = π aponta para
 * longe dele.
 */
export function traceFromObserver(r: number, psi: number, options: TraceOptions = {}): RayResult {
  const u0 = 1 / r;
  const s = Math.sin(psi);
  if (Math.abs(s) < 1e-12) {
    return Math.cos(psi) > 0
      ? { captured: true, phiExit: Number.NaN, minRadius: 2, trapped: false }
      : { captured: false, phiExit: 0, minRadius: r, trapped: false };
  }
  const b = impactParameter(r, psi);
  const radial = Math.sqrt(Math.max(0, 1 / (b * b) - u0 * u0 * (1 - 2 * u0)));
  // Mirando para dentro (cos ψ > 0), u cresce.
  const w0 = Math.cos(psi) >= 0 ? radial : -radial;
  return integrate(u0, w0, options);
}

/**
 * Raio angular do anel de Einstein exato para um observador em r (M) e uma
 * fonte no infinito exatamente atrás do buraco negro, rad: o ψ cujo raio
 * chega ao infinito do lado oposto, φ = (2n + 1)π. n = 0 é o anel principal;
 * n ≥ 1, os anéis relativísticos, coladinhos à sombra.
 */
export function einsteinRingAngle(r: number, order = 0): number {
  const target = (2 * order + 1) * Math.PI;
  let lo = shadowAngularRadius(r) + 1e-9;
  let hi = Math.PI - 1e-9;
  // φ_saída cai de ∞ (na borda da sombra) a 0 (apontando para longe).
  for (let i = 0; i < 80; i += 1) {
    const mid = 0.5 * (lo + hi);
    const result = traceFromObserver(r, mid, { step: 1e-3, maxPhi: target + 8 * Math.PI });
    const phi = result.captured ? Number.POSITIVE_INFINITY : result.phiExit;
    if (phi > target) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** Pontos (x, y) de um raio, em M, com o observador em (r, 0) e o buraco negro na origem. */
export function rayPath(
  r: number,
  psi: number,
  { maxRadius = 2 * r, step = 4e-3 }: { maxRadius?: number; step?: number } = {},
): { points: [number, number][]; captured: boolean } {
  const points: [number, number][] = [];
  // O raio gira no sentido de φ crescente; o sinal de ψ escolhe o lado.
  const side = psi >= 0 ? 1 : -1;
  const result = traceFromObserver(r, Math.abs(psi), {
    step,
    maxPhi: 12 * Math.PI,
    onStep: (phi, u) => {
      const radius = u > 1e-9 ? 1 / u : Number.POSITIVE_INFINITY;
      if (radius > maxRadius) return;
      points.push([radius * Math.cos(phi), side * radius * Math.sin(phi)]);
    },
  });
  return { points, captured: result.captured };
}

// --- Disco de acreção -------------------------------------------------------

/** Velocidade angular kepleriana Ω = √(M/r³) (unidades de M). */
export function keplerOmega(r: number): number {
  return Math.pow(r, -1.5);
}

/**
 * Fator de desvio g = ν_observado/ν_emitido de um fóton que sai do disco em r
 * (órbita circular kepleriana) com momento angular por energia λ = L_z/E em
 * torno do eixo do disco: g = √(1 − 3M/r) / (1 − Ω·λ). Junta o desvio
 * gravitacional, o transversal e o Doppler. λ > 0: o fóton sai no sentido em
 * que o gás gira, vindo na nossa direção — desvio para o azul.
 */
export function diskRedshift(r: number, lambda: number): number {
  return Math.sqrt(1 - 3 / r) / (1 - keplerOmega(r) * lambda);
}

/**
 * Perfil de temperatura de um disco fino com torque nulo na borda de dentro
 * (Shakura e Sunyaev, 1973): T ∝ r^(−3/4)·(1 − √(r_in/r))^(1/4), normalizado
 * para o máximo valer 1 (em r = 49/36·r_in).
 */
export function diskTemperature(r: number, inner = ISCO_RADIUS): number {
  if (r <= inner) return 0;
  const shape = (x: number): number => Math.pow(x, -0.75) * Math.pow(1 - Math.sqrt(inner / x), 0.25);
  return shape(r) / shape((49 / 36) * inner);
}
