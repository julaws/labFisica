import { type Store, createStore } from '../../core/store';

export type OnOff = 'on' | 'off';
export type FlightStatus = 'ready' | 'flying' | 'done';

export interface RocketState {
  /** Propelente total, kg. */
  propellant: number;
  /** Massa seca total (estruturas e motores), kg. */
  dryMass: number;
  /** Impulso específico, s. */
  isp: number;
  /** Vazão do primeiro estágio, kg/s. */
  massFlow: number;
  stages: 1 | 2 | 3;
  gravity: OnOff;
  drag: OnOff;
  /** Modo desafio: gravidade e arrasto ligados, metas na tela. */
  challenge: boolean;
  status: FlightStatus;
  /** Relógio do voo, s; atualizado algumas vezes por segundo para o HUD acompanhar. */
  clock: number;
  showNumbers: boolean;
}

export const ROCKET_RANGES = {
  propellant: { min: 10_000, max: 500_000 },
  dryMass: { min: 500, max: 60_000 },
  isp: { min: 200, max: 460 },
  massFlow: { min: 50, max: 5000 },
} as const;

/** Carga útil fixa, kg: uma tonelada, como um satélite pequeno. */
export const PAYLOAD = 1000;
/** Arrasto: C_d·A de um foguete de ~2,5 m de diâmetro, m². */
export const DRAG_AREA = 2.4;

/** Regras do desafio. */
export const CHALLENGE = {
  /** Massa máxima no lançamento, kg. */
  budget: 600_000,
  /** A estrutura pesa ao menos isto do propelente (senão o tanque não aguenta). */
  minDryFraction: 0.08,
  /** Aceleração máxima, em g (a carga não aguenta mais que isso). */
  maxGs: 6,
} as const;

export const INITIAL_ROCKET_STATE: RocketState = {
  propellant: 120_000,
  dryMass: 10_000,
  isp: 320,
  massFlow: 600,
  stages: 2,
  gravity: 'on',
  drag: 'on',
  challenge: false,
  status: 'ready',
  clock: 0,
  showNumbers: false,
};

export type RocketStore = Store<RocketState>;

export function createRocketStore(): RocketStore {
  return createStore<RocketState>({ ...INITIAL_ROCKET_STATE });
}
