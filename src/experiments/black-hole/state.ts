import { type Store, createStore } from '../../core/store';

export type BlackHoleView = 'real' | 'didactic';
export type DiskDisplay = 'on' | 'off';

export interface BlackHoleState {
  /** Massa do buraco negro, massas solares. */
  mass: number;
  /** Distância do observador do telescópio ao centro, km. */
  distance: number;
  /** Ângulo do observador acima do plano do disco, graus. */
  inclination: number;
  /** Posição da estrela de fundo em relação ao alinhamento, graus (horizontal e vertical). */
  sourceX: number;
  sourceY: number;
  disk: DiskDisplay;
  view: BlackHoleView;
  showNumbers: boolean;
}

export const BLACK_HOLE_RANGES = {
  mass: { min: 1, max: 30 },
  distance: { min: 100, max: 5000 },
  inclination: { min: 0, max: 89 },
  source: { min: -12, max: 12 },
} as const;

export const INITIAL_BLACK_HOLE_STATE: BlackHoleState = {
  mass: 10,
  distance: 500,
  inclination: 8,
  sourceX: 5,
  sourceY: 3,
  disk: 'on',
  view: 'real',
  showNumbers: false,
};

export type BlackHoleStore = Store<BlackHoleState>;

export function createBlackHoleStore(): BlackHoleStore {
  return createStore<BlackHoleState>({ ...INITIAL_BLACK_HOLE_STATE });
}
