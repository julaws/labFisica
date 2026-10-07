import { type Store, createStore } from '../../core/store';
import type { Waveform } from '../../optics/acoustics/beats';

export type OnOff = 'on' | 'off';
export type ScopeMode = 'beats' | 'waves';

export interface BeatsState {
  /** Frequência do oscilador 1, Hz. */
  f1: number;
  /** Frequência-base do oscilador 2 (intervalo ou tecla), Hz. */
  f2Base: number;
  /** Desafinação somada a f2, Hz. */
  detune: number;
  /** Amplitudes, 0 a 1. */
  a1: number;
  a2: number;
  waveform: Waveform;
  /** Volume, 0 a 1. */
  volume: number;
  sound: OnOff;
  scope: ScopeMode;
  showNumbers: boolean;
}

export const BEATS_RANGES = {
  frequency: { min: 55, max: 1760 },
  detune: { min: -20, max: 20 },
} as const;

export const INITIAL_BEATS_STATE: BeatsState = {
  f1: 440,
  f2Base: 440,
  // Duas batidas por segundo: devagar o bastante para contar.
  detune: 2,
  a1: 0.8,
  a2: 0.8,
  waveform: 'sine',
  volume: 0.6,
  sound: 'off',
  scope: 'beats',
  showNumbers: false,
};

export type BeatsStore = Store<BeatsState>;

export function createBeatsStore(): BeatsStore {
  return createStore<BeatsState>({ ...INITIAL_BEATS_STATE });
}
