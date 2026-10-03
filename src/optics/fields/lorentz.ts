/**
 * Força magnética sobre elétrons (ADR 0010): campo das bobinas de Helmholtz,
 * raio de giro, hélice, seletor de velocidades (filtro de Wien) e a trajetória
 * integrada passo a passo.
 *
 * TypeScript puro, unidades SI (metros, segundos, volts, tesla). O diretório
 * se chama `optics` por história: é o motor de física do laboratório inteiro.
 *
 * ## A força
 *
 *     F = q·(E + v × B)
 *
 * Num campo B uniforme, a componente da velocidade perpendicular a B gira em
 * círculo de raio r = p⊥ / (|q|·B); a paralela segue reta. Juntas: uma hélice
 * de passo 2π·p∥ / (|q|·B). Com E ⟂ B ⟂ v, as duas forças se cancelam só para
 * v = E/B: é o seletor de velocidades.
 *
 * ## A integração
 *
 * Método de Boris relativístico (Boris, 1970; Birdsall e Langdon, *Plasma
 * Physics via Computer Simulation*): meio impulso elétrico, rotação
 * magnética exata em ângulo, meio impulso elétrico. Num campo só magnético ele
 * conserva a energia exatamente, e o círculo não espirala para fora.
 */

import { ELECTRON_MASS, ELEMENTARY_CHARGE, SPEED_OF_LIGHT } from '../waves/double-slit';

/** Permeabilidade do vácuo, CODATA 2018 (H/m). */
export const VACUUM_PERMEABILITY = 1.25663706212e-6;

export type Vec3 = readonly [number, number, number];

const REST_ENERGY = ELECTRON_MASS * SPEED_OF_LIGHT * SPEED_OF_LIGHT;

/** Fator de Lorentz de um elétron acelerado por `voltage` volts. */
export function electronGamma(voltage: number): number {
  return 1 + (ELEMENTARY_CHARGE * voltage) / REST_ENERGY;
}

/** Momento do elétron acelerado por `voltage` volts, kg·m/s (relativístico). */
export function electronMomentum(voltage: number): number {
  const energy = ELEMENTARY_CHARGE * voltage;
  return Math.sqrt(2 * ELECTRON_MASS * energy * (1 + energy / (2 * REST_ENERGY)));
}

/** Velocidade do elétron acelerado por `voltage` volts, m/s. */
export function electronSpeed(voltage: number): number {
  const gamma = electronGamma(voltage);
  return SPEED_OF_LIGHT * Math.sqrt(1 - 1 / (gamma * gamma));
}

/** Tensão que dá ao elétron a velocidade `speed`, V (inversa de `electronSpeed`). */
export function voltageForSpeed(speed: number): number {
  const beta = speed / SPEED_OF_LIGHT;
  const gamma = 1 / Math.sqrt(1 - beta * beta);
  return ((gamma - 1) * REST_ENERGY) / ELEMENTARY_CHARGE;
}

/**
 * Campo no centro de um par de Helmholtz: duas espiras de raio R separadas
 * por R, mesma corrente, B = (4/5)^{3/2}·μ₀·N·I / R.
 */
export function helmholtzField(turns: number, current: number, radius: number): number {
  return (4 / 5) ** 1.5 * VACUUM_PERMEABILITY * turns * current / radius;
}

/** Corrente que dá o campo `field` no centro do par de Helmholtz, A. */
export function helmholtzCurrent(field: number, turns: number, radius: number): number {
  return field / helmholtz(turns, radius);
}

const helmholtz = (turns: number, radius: number): number => helmholtzField(turns, 1, radius);

/**
 * Raio de giro de um elétron de momento `momentum` num campo `field`, com
 * ângulo `pitchAngle` entre a velocidade e o campo: r = p·sen θ / (e·B).
 */
export function gyroRadius(momentum: number, field: number, pitchAngle = Math.PI / 2): number {
  if (field <= 0) return Number.POSITIVE_INFINITY;
  return (momentum * Math.abs(Math.sin(pitchAngle))) / (ELEMENTARY_CHARGE * field);
}

/** Passo da hélice, m: quanto o elétron avança ao longo de B numa volta. */
export function helixPitch(momentum: number, field: number, pitchAngle: number): number {
  if (field <= 0) return Number.POSITIVE_INFINITY;
  return (2 * Math.PI * momentum * Math.abs(Math.cos(pitchAngle))) / (ELEMENTARY_CHARGE * field);
}

/** Período de uma volta, s: T = 2π·γ·m / (e·B). Não depende do raio. */
export function cyclotronPeriod(voltage: number, field: number): number {
  if (field <= 0) return Number.POSITIVE_INFINITY;
  return (2 * Math.PI * electronGamma(voltage) * ELECTRON_MASS) / (ELEMENTARY_CHARGE * field);
}

/** Velocidade que atravessa um filtro de Wien sem desviar: v = E/B. */
export function wienSpeed(electricField: number, magneticField: number): number {
  if (magneticField <= 0) return Number.POSITIVE_INFINITY;
  return electricField / magneticField;
}

// --- Trajetória ---------------------------------------------------------------

export interface FieldSample {
  /** Campo elétrico, V/m. */
  readonly E: Vec3;
  /** Campo magnético, T. */
  readonly B: Vec3;
}

export interface TraceOptions {
  readonly position: Vec3;
  /** Direção inicial (será normalizada). */
  readonly direction: Vec3;
  /** Tensão de aceleração do elétron, V. */
  readonly voltage: number;
  /** Campos em cada ponto. */
  readonly field: (x: number, y: number, z: number) => FieldSample;
  /**
   * Devolve um motivo de parada (bateu no vidro, numa placa…) ou null para
   * seguir. Chamado a cada passo.
   */
  readonly stop: (x: number, y: number, z: number) => string | null;
  /** Passo espacial, m. */
  readonly step?: number;
  /** Comprimento máximo do caminho, m. */
  readonly maxLength?: number;
  /** Uma amostra a cada `sampleAngle` rad de curva ou `sampleLength` m. */
  readonly sampleAngle?: number;
  readonly sampleLength?: number;
}

export interface Trace {
  /** Pontos amostrados, xyz em sequência. */
  readonly points: Float32Array;
  /** Comprimento percorrido, m. */
  readonly length: number;
  /** Por que parou: o motivo de `stop`, ou 'length'. */
  readonly end: string;
}

/**
 * Integra um elétron (carga −e) pelo método de Boris relativístico, com passo
 * espacial fixo, e devolve o caminho amostrado.
 */
export function traceElectron(options: TraceOptions): Trace {
  const step = options.step ?? 5e-4;
  const maxLength = options.maxLength ?? 3;
  const sampleAngle = options.sampleAngle ?? (2 * Math.PI) / 180;
  const sampleLength = options.sampleLength ?? 0.02;
  const charge = -ELEMENTARY_CHARGE;
  const qm = charge / ELECTRON_MASS;
  const c2 = SPEED_OF_LIGHT * SPEED_OF_LIGHT;

  let [x, y, z] = options.position;
  const [dx0, dy0, dz0] = options.direction;
  const norm = Math.hypot(dx0, dy0, dz0) || 1;
  // u = γ·v
  const gamma0 = electronGamma(options.voltage);
  const speed0 = electronSpeed(options.voltage);
  let ux = (dx0 / norm) * speed0 * gamma0;
  let uy = (dy0 / norm) * speed0 * gamma0;
  let uz = (dz0 / norm) * speed0 * gamma0;

  const points: number[] = [x, y, z];
  let length = 0;
  let sinceSample = 0;
  let lastDx = dx0 / norm;
  let lastDy = dy0 / norm;
  let lastDz = dz0 / norm;
  let end = 'length';

  while (length < maxLength) {
    const gamma = Math.sqrt(1 + (ux * ux + uy * uy + uz * uz) / c2);
    const speed = Math.hypot(ux, uy, uz) / gamma;
    if (speed <= 0) break;
    const dt = step / speed;
    const { E, B } = options.field(x, y, z);

    // Meio impulso elétrico.
    const h = (qm * dt) / 2;
    let mx = ux + h * E[0];
    let my = uy + h * E[1];
    let mz = uz + h * E[2];
    // Rotação magnética.
    const gammaMinus = Math.sqrt(1 + (mx * mx + my * my + mz * mz) / c2);
    const tx = (h * B[0]) / gammaMinus;
    const ty = (h * B[1]) / gammaMinus;
    const tz = (h * B[2]) / gammaMinus;
    const t2 = tx * tx + ty * ty + tz * tz;
    const px = mx + (my * tz - mz * ty);
    const py = my + (mz * tx - mx * tz);
    const pz = mz + (mx * ty - my * tx);
    const s = 2 / (1 + t2);
    mx += s * (py * tz - pz * ty);
    my += s * (pz * tx - px * tz);
    mz += s * (px * ty - py * tx);
    // Outro meio impulso elétrico.
    ux = mx + h * E[0];
    uy = my + h * E[1];
    uz = mz + h * E[2];

    const gammaNew = Math.sqrt(1 + (ux * ux + uy * uy + uz * uz) / c2);
    const vx = ux / gammaNew;
    const vy = uy / gammaNew;
    const vz = uz / gammaNew;
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    const travelled = Math.hypot(vx, vy, vz) * dt;
    length += travelled;
    sinceSample += travelled;

    const v = Math.hypot(vx, vy, vz) || 1;
    const ndx = vx / v;
    const ndy = vy / v;
    const ndz = vz / v;
    // Quanto a direção girou desde a última amostra.
    const turned = Math.acos(Math.min(1, Math.max(-1, ndx * lastDx + ndy * lastDy + ndz * lastDz)));

    const reason = options.stop(x, y, z);
    if (reason) {
      end = reason;
      points.push(x, y, z);
      break;
    }
    if (turned >= sampleAngle || sinceSample >= sampleLength) {
      points.push(x, y, z);
      sinceSample = 0;
      lastDx = ndx;
      lastDy = ndy;
      lastDz = ndz;
    }
  }
  if (end === 'length') points.push(x, y, z);
  return { points: new Float32Array(points), length, end };
}

// --- Hélice analítica -----------------------------------------------------------

export interface HelixOptions {
  readonly position: Vec3;
  /** Direção inicial da velocidade (será normalizada). */
  readonly direction: Vec3;
  /** Tensão de aceleração do elétron, V. */
  readonly voltage: number;
  /** Campo magnético uniforme, T (vetor). */
  readonly field: Vec3;
  /** Motivo de parada ou null; testado a cada amostra. */
  readonly stop: (x: number, y: number, z: number) => string | null;
  /** Ângulo de giro entre amostras, rad. */
  readonly angleStep?: number;
  /** Passo das amostras numa reta (campo nulo ou paralelo), m. */
  readonly lineStep?: number;
  /** Comprimento máximo do caminho, m. */
  readonly maxLength?: number;
}

/**
 * Trajetória exata de um elétron num campo magnético uniforme, como fórmula:
 *
 *     r(s) = origem + a·s + u·sen s + w·(1 − cos s),   0 ≤ s ≤ fim
 *
 * Na hélice, s é o ângulo girado θ = ω·t e, com b = B/|B|, v∥ a componente da
 * velocidade ao longo de b e u⊥ a perpendicular, ω = e|B|/(γm):
 *
 *     a = v∥·b/ω,   u = u⊥/ω,   w = (b × u⊥)/ω
 *
 * (o elétron tem carga negativa e gira em torno de +b). Numa reta (campo nulo
 * ou paralelo), a = direção·comprimento, u = w = 0 e s vai de 0 a 1.
 *
 * Por ser fórmula, quem desenha pode avaliá-la direto na placa de vídeo, sem
 * enviar pontos: é o que o experimento da força magnética faz.
 */
export interface HelixPath {
  readonly origin: Vec3;
  readonly along: Vec3;
  readonly sine: Vec3;
  readonly cosine: Vec3;
  /** Valor final de s, onde o elétron para. */
  readonly end: number;
  /** Comprimento de caminho por unidade de s, m. */
  readonly lengthPerUnit: number;
  /** Por que parou: o motivo de `stop`, ou 'length'. */
  readonly reason: string;
}

/** Ponto da trajetória no parâmetro `s`. */
export function helixPoint(path: HelixPath, s: number): [number, number, number] {
  const sin = Math.sin(s);
  const cos = 1 - Math.cos(s);
  return [
    path.origin[0] + path.along[0] * s + path.sine[0] * sin + path.cosine[0] * cos,
    path.origin[1] + path.along[1] * s + path.sine[1] * sin + path.cosine[1] * cos,
    path.origin[2] + path.along[2] * s + path.sine[2] * sin + path.cosine[2] * cos,
  ];
}

/**
 * Monta a trajetória e acha onde ela para: anda em passos de `angleStep` (ou
 * `lineStep` na reta) testando `stop`, e refina o ponto de contato por
 * bisseção. O caminho em si não é amostrado: quem desenha avalia a fórmula.
 */
export function helixPath(options: HelixOptions): HelixPath {
  const angleStep = options.angleStep ?? (4 * Math.PI) / 180;
  const lineStep = options.lineStep ?? 0.01;
  const maxLength = options.maxLength ?? 3;
  const [dx, dy, dz] = options.direction;
  const norm = Math.hypot(dx, dy, dz) || 1;
  const speed = electronSpeed(options.voltage);
  const vx = (dx / norm) * speed;
  const vy = (dy / norm) * speed;
  const vz = (dz / norm) * speed;
  const [Bx, By, Bz] = options.field;
  const Bmag = Math.hypot(Bx, By, Bz);
  const bx = Bmag > 0 ? Bx / Bmag : 0;
  const by = Bmag > 0 ? By / Bmag : 0;
  const bz = Bmag > 0 ? Bz / Bmag : 0;
  const parallel = vx * bx + vy * by + vz * bz;
  const ux = vx - parallel * bx;
  const uy = vy - parallel * by;
  const uz = vz - parallel * bz;

  let along: Vec3;
  let sine: Vec3 = [0, 0, 0];
  let cosine: Vec3 = [0, 0, 0];
  let lengthPerUnit: number;
  let step: number;
  let limit: number;
  if (Bmag === 0 || Math.hypot(ux, uy, uz) < speed * 1e-9) {
    // Reta: s de 0 a 1 percorre `maxLength`.
    along = [(vx / speed) * maxLength, (vy / speed) * maxLength, (vz / speed) * maxLength];
    lengthPerUnit = maxLength;
    step = lineStep / maxLength;
    limit = 1;
  } else {
    const omega = (ELEMENTARY_CHARGE * Bmag) / (electronGamma(options.voltage) * ELECTRON_MASS);
    along = [(parallel * bx) / omega, (parallel * by) / omega, (parallel * bz) / omega];
    sine = [ux / omega, uy / omega, uz / omega];
    cosine = [(by * uz - bz * uy) / omega, (bz * ux - bx * uz) / omega, (bx * uy - by * ux) / omega];
    lengthPerUnit = speed / omega;
    step = angleStep;
    limit = maxLength / lengthPerUnit;
  }
  const path = { origin: options.position, along, sine, cosine, end: limit, lengthPerUnit, reason: 'length' };

  let previous = 0;
  for (let s = step; ; s += step) {
    const parameter = Math.min(s, limit);
    const [x, y, z] = helixPoint(path, parameter);
    const reason = options.stop(x, y, z);
    if (reason) {
      // Bisseção entre a última amostra boa e esta: o ponto de contato.
      let lo = previous;
      let hi = parameter;
      for (let i = 0; i < 14; i += 1) {
        const mid = (lo + hi) / 2;
        const [mx, my, mz] = helixPoint(path, mid);
        if (options.stop(mx, my, mz)) hi = mid;
        else lo = mid;
      }
      return { ...path, end: hi, reason };
    }
    previous = parameter;
    if (parameter >= limit) return path;
  }
}

/**
 * A mesma trajetória de `helixPath`, amostrada em pontos (a cada `angleStep`
 * na hélice, `lineStep` na reta). Para quem precisa de uma polilinha.
 */
export function traceHelix(options: HelixOptions): Trace {
  const path = helixPath(options);
  const helical = path.sine.some((value) => value !== 0) || path.cosine.some((value) => value !== 0);
  const step = helical ? (options.angleStep ?? (4 * Math.PI) / 180) : (options.lineStep ?? 0.01) / path.lengthPerUnit;
  const points: number[] = [...path.origin];
  for (let s = step; s < path.end; s += step) points.push(...helixPoint(path, s));
  points.push(...helixPoint(path, path.end));
  return { points: new Float32Array(points), length: path.end * path.lengthPerUnit, end: path.reason };
}

/** Aparelho padrão (ADR 0010). */
export const DEFAULT_MAGNETIC = {
  /** Bobinas de Helmholtz: espiras por bobina e raio, m. */
  coilTurns: 200,
  coilRadius: 0.3,
  /** Raio da câmara de vidro, m. */
  chamberRadius: 0.25,
  /** Campo no centro, T: o círculo do elétron mais rápido (10,7 cm) cabe inteiro. */
  field: 0.5e-3,
  fieldRange: { min: 0, max: 2e-3 },
  /** Tensão do canhão, V. */
  voltage: 250,
  voltageRange: { min: 100, max: 500 },
  /** Dispersão didática de energia: de 60% a 100% de eU (cores e raios diferentes). */
  spread: { min: 0.6, max: 1 },
} as const;
