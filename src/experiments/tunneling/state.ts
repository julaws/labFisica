import { type Store, createStore } from '../../core/store';
import { DEFAULT_TUNNELING } from '../../optics/quantum/tunneling';

export type WaveDisplay = 'on' | 'off';

export interface TunnelingState {
  /** Corrente do feixe incidente, A: quantos elétrons por segundo chegam. */
  incident: number;
  /** Altura da barreira, eV. */
  height: number;
  /** Largura da barreira, m. */
  width: number;
  /** Mostrar a onda do elétron sobre o feixe. */
  wave: WaveDisplay;
}

export const INITIAL_TUNNELING_STATE: TunnelingState = {
  incident: DEFAULT_TUNNELING.incident,
  height: DEFAULT_TUNNELING.height,
  width: DEFAULT_TUNNELING.width,
  wave: 'on',
};

export type TunnelingStore = Store<TunnelingState>;

export function createTunnelingStore(): TunnelingStore {
  return createStore<TunnelingState>({ ...INITIAL_TUNNELING_STATE });
}
