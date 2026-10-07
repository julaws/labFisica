import { type Store, createStore } from '../../core/store';
import { type PlateShape, SQUARE_PLATE, squareModeFrequency } from '../../optics/acoustics/chladni';

export type OnOff = 'on' | 'off';

export interface ChladniState {
  shape: PlateShape;
  /** Frequência do excitador (ajuste grosso), Hz. */
  frequency: number;
  /** Sintonia fina, somada à frequência, Hz. */
  fine: number;
  /** Quantidade de grãos de areia. */
  sand: number;
  sound: OnOff;
  sweep: OnOff;
  showNumbers: boolean;
}

export const CHLADNI_RANGES = {
  frequency: { min: 30, max: 4000 },
  fine: { min: -20, max: 20 },
} as const;

export const SAND_AMOUNTS = [5000, 10000, 20000, 40000] as const;

export const INITIAL_CHLADNI_STATE: ChladniState = {
  shape: 'square',
  // Na ressonância do modo (1, 4) da placa quadrada: 17 × 33,2 Hz.
  frequency: squareModeFrequency(SQUARE_PLATE, 1, 4),
  fine: 0,
  sand: 20000,
  sound: 'off',
  sweep: 'off',
  showNumbers: false,
};

export type ChladniStore = Store<ChladniState>;

export function createChladniStore(): ChladniStore {
  return createStore<ChladniState>({ ...INITIAL_CHLADNI_STATE });
}
