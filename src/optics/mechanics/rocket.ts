/**
 * Foguete: equação de Tsiolkovsky e conservação do momento (ADR 0020).
 *
 * TypeScript puro, SI (kg, m, s). Voo vertical, em uma dimensão.
 *
 * ## Tsiolkovsky
 *
 * Um foguete que ejeta gás com velocidade v_e (em relação a ele) ganha
 *
 *     Δv = v_e · ln(m₀/m_f),     v_e = I_sp · g₀,
 *
 * sem forças externas, não importa o ritmo da queima. Com estágios, cada um
 * soma o seu Δv, com a massa de cima como carga.
 *
 * ## Momento
 *
 * Num intervalo dt, o foguete de massa m e velocidade v solta dm = ṁ·dt de gás
 * a v − v_e (no referencial da Terra). Sem forças externas, o momento total
 * — foguete, gás já ejetado e estágios descartados — fica constante:
 *
 *     d(mv)/dt = v_e·ṁ − v·ṁ + F_ext,    dp_gás/dt = ṁ·(v − v_e)
 *
 * e a soma das duas é só F_ext. O empuxo é F = v_e·ṁ. Com gravidade e arrasto,
 * o momento total muda exatamente pelo impulso externo ∫F_ext dt.
 *
 * ## A integração
 *
 * Runge–Kutta de 4ª ordem no estado (altitude, velocidade, massa, momento do
 * gás, impulso externo), com o passo ajustado para cair exatamente no fim de
 * cada queima. Gravidade g = g₀·(R/(R + h))²; arrasto ½ρC_dAv², atmosfera
 * exponencial ρ = ρ₀·e^(−h/H).
 */

/** Gravidade padrão, m/s² (exata, CGPM 1901). */
export const G0 = 9.80665;
/** Raio médio da Terra, m. */
export const EARTH_RADIUS = 6.371e6;
/** Densidade do ar ao nível do mar, kg/m³, e altura de escala, m (atmosfera exponencial). */
export const SEA_LEVEL_DENSITY = 1.225;
export const SCALE_HEIGHT = 8500;
/** Velocidade orbital circular baixa (~200 km), m/s: o alvo do desafio. */
export const ORBITAL_SPEED = 7800;

export interface Stage {
  /** Massa seca (estrutura e motor), kg. */
  readonly dryMass: number;
  /** Massa de propelente, kg. */
  readonly propellant: number;
  /** Impulso específico, s. */
  readonly isp: number;
  /** Vazão de massa, kg/s. */
  readonly massFlow: number;
}

export interface Vehicle {
  /** Do primeiro (de baixo) ao último. */
  readonly stages: readonly Stage[];
  /** Carga útil, kg. */
  readonly payload: number;
  /** Coeficiente de arrasto vezes a área frontal, m². */
  readonly dragArea: number;
}

export const exhaustVelocity = (isp: number): number => isp * G0;

/** Δv = v_e·ln(m₀/m_f), m/s. */
export function tsiolkovsky(exhaust: number, initialMass: number, finalMass: number): number {
  return exhaust * Math.log(initialMass / finalMass);
}

/** Massa total no lançamento, kg. */
export function liftoffMass(vehicle: Vehicle): number {
  return vehicle.payload + vehicle.stages.reduce((sum, stage) => sum + stage.dryMass + stage.propellant, 0);
}

/** Δv ideal de cada estágio e o total (sem gravidade nem arrasto), m/s. */
export function idealDeltaV(vehicle: Vehicle): { stages: number[]; total: number; massRatios: number[] } {
  const stages: number[] = [];
  const massRatios: number[] = [];
  let above = vehicle.payload + vehicle.stages.reduce((sum, s) => sum + s.dryMass + s.propellant, 0);
  for (const stage of vehicle.stages) {
    const m0 = above;
    const mf = m0 - stage.propellant;
    massRatios.push(m0 / mf);
    stages.push(tsiolkovsky(exhaustVelocity(stage.isp), m0, mf));
    above = mf - stage.dryMass;
  }
  return { stages, total: stages.reduce((a, b) => a + b, 0), massRatios };
}

export const gravityAt = (altitude: number): number => G0 * (EARTH_RADIUS / (EARTH_RADIUS + Math.max(altitude, 0))) ** 2;
export const airDensity = (altitude: number): number => SEA_LEVEL_DENSITY * Math.exp(-Math.max(altitude, 0) / SCALE_HEIGHT);

export interface FlightOptions {
  readonly gravity: boolean;
  readonly drag: boolean;
  /** Passo de integração, s. */
  readonly dt?: number;
  /** Tempo de voo depois da última queima, s. */
  readonly coast?: number;
}

export interface FlightSample {
  readonly t: number;
  readonly altitude: number;
  readonly velocity: number;
  readonly mass: number;
  readonly acceleration: number;
  readonly thrust: number;
  /** Estágio queimando (0, 1, 2…), ou −1 depois do fim. */
  readonly stage: number;
  /** Momento do foguete (mv), do gás ejetado e dos estágios descartados, kg·m/s. */
  readonly rocketMomentum: number;
  readonly gasMomentum: number;
  readonly droppedMomentum: number;
  /** Impulso das forças externas (gravidade e arrasto) até aqui, N·s. */
  readonly externalImpulse: number;
  /** Perdas de velocidade acumuladas: ∫g dt e ∫D/m dt, m/s. */
  readonly gravityLoss: number;
  readonly dragLoss: number;
  /** Na plataforma, sem empuxo para vencer o peso. */
  readonly grounded: boolean;
}

export interface Flight {
  readonly samples: readonly FlightSample[];
  /** Fim das queimas de cada estágio, s. */
  readonly burnouts: readonly number[];
  /** Velocidade, altitude e perdas no fim da última queima. */
  readonly burnout: FlightSample;
  /** Empuxo de decolagem menor que o peso. */
  readonly cannotLiftOff: boolean;
}

interface State {
  h: number;
  v: number;
  m: number;
  pg: number;
  jext: number;
  lg: number;
  ld: number;
}

/**
 * Integra o voo. A massa de cada estágio cai linearmente com a vazão; no fim
 * da queima, a estrutura dele é solta (e leva o próprio momento, mv).
 */
export function simulateFlight(vehicle: Vehicle, options: FlightOptions): Flight {
  const dt = options.dt ?? 0.05;
  const coast = options.coast ?? 60;
  const samples: FlightSample[] = [];
  const burnouts: number[] = [];
  let state: State = { h: 0, v: 0, m: liftoffMass(vehicle), pg: 0, jext: 0, lg: 0, ld: 0 };
  let t = 0;
  let dropped = 0;
  let cannotLiftOff = false;

  const forces = (s: State, stage: Stage | null) => {
    const flow = stage ? stage.massFlow : 0;
    const ve = stage ? exhaustVelocity(stage.isp) : 0;
    const thrust = ve * flow;
    const g = options.gravity ? gravityAt(s.h) : 0;
    const drag = options.drag ? 0.5 * airDensity(s.h) * vehicle.dragArea * s.v * Math.abs(s.v) : 0;
    let external = -s.m * g - drag;
    // Na plataforma: o chão segura o foguete enquanto o empuxo não vence o peso.
    const onPad = s.h <= 0 && s.v <= 0 && thrust + external <= 0;
    if (onPad) external = -thrust;
    return { flow, ve, thrust, g, drag, external, onPad };
  };

  const derivative = (s: State, stage: Stage | null): State => {
    const f = forces(s, stage);
    const accel = (f.thrust + f.external) / s.m;
    return {
      h: f.onPad ? 0 : s.v,
      v: f.onPad ? 0 : accel,
      m: -f.flow,
      pg: f.flow * (s.v - f.ve),
      jext: f.external,
      lg: f.onPad ? 0 : f.g,
      ld: f.onPad ? 0 : f.drag / s.m,
    };
  };

  const add = (a: State, b: State, k: number): State => ({
    h: a.h + b.h * k,
    v: a.v + b.v * k,
    m: a.m + b.m * k,
    pg: a.pg + b.pg * k,
    jext: a.jext + b.jext * k,
    lg: a.lg + b.lg * k,
    ld: a.ld + b.ld * k,
  });

  const step = (s: State, stage: Stage | null, h: number): State => {
    const k1 = derivative(s, stage);
    const k2 = derivative(add(s, k1, h / 2), stage);
    const k3 = derivative(add(s, k2, h / 2), stage);
    const k4 = derivative(add(s, k3, h), stage);
    const next: State = {
      h: s.h + (h / 6) * (k1.h + 2 * k2.h + 2 * k3.h + k4.h),
      v: s.v + (h / 6) * (k1.v + 2 * k2.v + 2 * k3.v + k4.v),
      m: s.m + (h / 6) * (k1.m + 2 * k2.m + 2 * k3.m + k4.m),
      pg: s.pg + (h / 6) * (k1.pg + 2 * k2.pg + 2 * k3.pg + k4.pg),
      jext: s.jext + (h / 6) * (k1.jext + 2 * k2.jext + 2 * k3.jext + k4.jext),
      lg: s.lg + (h / 6) * (k1.lg + 2 * k2.lg + 2 * k3.lg + k4.lg),
      ld: s.ld + (h / 6) * (k1.ld + 2 * k2.ld + 2 * k3.ld + k4.ld),
    };
    // Caiu de volta no chão: para.
    if (next.h < 0) {
      next.h = 0;
      next.v = Math.max(next.v, 0);
    }
    return next;
  };

  const record = (s: State, stage: Stage | null, index: number): void => {
    const f = forces(s, stage);
    samples.push({
      t,
      altitude: s.h,
      velocity: s.v,
      mass: s.m,
      acceleration: f.onPad ? 0 : (f.thrust + f.external) / s.m,
      thrust: f.thrust,
      stage: index,
      rocketMomentum: s.m * s.v,
      gasMomentum: s.pg,
      droppedMomentum: dropped,
      externalImpulse: s.jext,
      gravityLoss: s.lg,
      dragLoss: s.ld,
      grounded: f.onPad,
    });
  };

  vehicle.stages.forEach((stage, index) => {
    const burn = stage.massFlow > 0 ? stage.propellant / stage.massFlow : 0;
    if (index === 0) {
      const f = forces(state, stage);
      cannotLiftOff = options.gravity && f.thrust <= state.m * f.g;
    }
    let elapsed = 0;
    record(state, stage, index);
    while (elapsed < burn - 1e-9) {
      const h = Math.min(dt, burn - elapsed);
      state = step(state, stage, h);
      elapsed += h;
      t += h;
      record(state, stage, index);
    }
    burnouts.push(t);
    // Separação: a estrutura do estágio sai com a velocidade do foguete.
    dropped += stage.dryMass * state.v;
    state = { ...state, m: state.m - stage.dryMass };
  });

  const burnout = samples.at(-1)!;
  let elapsed = 0;
  while (elapsed < coast - 1e-9) {
    const h = Math.min(dt * 4, coast - elapsed);
    state = step(state, null, h);
    elapsed += h;
    t += h;
    record(state, null, -1);
  }
  return { samples, burnouts, burnout, cannotLiftOff };
}

/** Amostra do voo no instante t (interpolação linear). */
export function sampleAt(flight: Flight, t: number): FlightSample {
  const { samples } = flight;
  if (t <= samples[0]!.t) return samples[0]!;
  if (t >= samples.at(-1)!.t) return samples.at(-1)!;
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const a = samples[lo]!;
  const b = samples[hi]!;
  const f = (t - a.t) / (b.t - a.t);
  const mix = (x: number, y: number): number => x + (y - x) * f;
  return {
    ...a,
    t,
    altitude: mix(a.altitude, b.altitude),
    velocity: mix(a.velocity, b.velocity),
    mass: mix(a.mass, b.mass),
    acceleration: mix(a.acceleration, b.acceleration),
    rocketMomentum: mix(a.rocketMomentum, b.rocketMomentum),
    gasMomentum: mix(a.gasMomentum, b.gasMomentum),
    externalImpulse: mix(a.externalImpulse, b.externalImpulse),
    gravityLoss: mix(a.gravityLoss, b.gravityLoss),
    dragLoss: mix(a.dragLoss, b.dragLoss),
  };
}

/**
 * Divide propelente e estrutura entre os estágios: o de baixo é o maior. As
 * frações (75/25, 70/22/8) são as de foguetes reais de dois e três estágios,
 * arredondadas. A vazão de cada estágio é proporcional ao propelente dele, e
 * todos queimam pelo mesmo tempo.
 */
export const STAGE_SPLITS: Record<1 | 2 | 3, readonly number[]> = {
  1: [1],
  2: [0.75, 0.25],
  3: [0.7, 0.22, 0.08],
};

export interface VehicleDesign {
  readonly propellant: number;
  readonly dryMass: number;
  readonly isp: number;
  /** Vazão do primeiro estágio, kg/s. */
  readonly massFlow: number;
  readonly stages: 1 | 2 | 3;
  readonly payload: number;
  readonly dragArea: number;
}

export function buildVehicle(design: VehicleDesign): Vehicle {
  const split = STAGE_SPLITS[design.stages];
  const first = split[0]!;
  return {
    payload: design.payload,
    dragArea: design.dragArea,
    stages: split.map((fraction) => ({
      dryMass: design.dryMass * fraction,
      propellant: design.propellant * fraction,
      isp: design.isp,
      massFlow: (design.massFlow * fraction) / first,
    })),
  };
}
