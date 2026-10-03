import { type Store, createStore } from '../../core/store';
import { DEFAULT_MAGNETIC } from '../../optics/fields/lorentz';

/** Energia dos elétrons do feixe: espalhada (didática) ou única (real). */
export type EnergySpread = 'wide' | 'none';

export interface MagneticState {
  /** Campo no centro das bobinas de Helmholtz, T. */
  field: number;
  /**
   * Giro das bobinas em torno do eixo vertical, graus. 0° põe o campo
   * perpendicular ao feixe (círculos); 90°, paralelo (reta); 180°, invertido.
   */
  angle: number;
  /** Tensão de aceleração do canhão, V. */
  voltage: number;
  spread: EnergySpread;
  /** Seletor de velocidades ligado (campos E e B cruzados). */
  selector: boolean;
  /** Tensão entre as placas do seletor, V. */
  selectorVoltage: number;
}

export const INITIAL_MAGNETIC_STATE: MagneticState = {
  field: DEFAULT_MAGNETIC.field,
  angle: 0,
  voltage: DEFAULT_MAGNETIC.voltage,
  spread: 'wide',
  selector: false,
  selectorVoltage: DEFAULT_MAGNETIC.selectorVoltage,
};

export type MagneticStore = Store<MagneticState>;

export function createMagneticStore(): MagneticStore {
  return createStore<MagneticState>({ ...INITIAL_MAGNETIC_STATE });
}
