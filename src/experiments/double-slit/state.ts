import { type Store, createStore } from '../../core/store';
import { DEFAULT_DOUBLE_SLIT } from '../../optics/waves/double-slit';

/**
 * Cores do fósforo do anteparo (ADR 0009). Elétron não tem cor: a cor é a da
 * luz que o fósforo emite quando um elétron o atinge, e também a do desenho do
 * feixe. Os anteparos reais costumam ser verdes (fósforo P31, ~530 nm).
 */
export type PhosphorColor = 'green' | 'cyan' | 'amber' | 'violet' | 'white';

export const PHOSPHOR_COLORS: readonly PhosphorColor[] = ['green', 'cyan', 'amber', 'violet', 'white'];

export const PHOSPHOR: Record<PhosphorColor, { hex: number; label: { 'pt-BR': string; en: string } }> = {
  green: { hex: 0x52ff8c, label: { 'pt-BR': 'Verde', en: 'Green' } },
  cyan: { hex: 0x7fe3ff, label: { 'pt-BR': 'Ciano', en: 'Cyan' } },
  amber: { hex: 0xffb45c, label: { 'pt-BR': 'Âmbar', en: 'Amber' } },
  violet: { hex: 0xb3a8ff, label: { 'pt-BR': 'Violeta', en: 'Violet' } },
  white: { hex: 0xeef2fa, label: { 'pt-BR': 'Branco', en: 'White' } },
};

export interface DoubleSlitState {
  /** Fenda esquerda (vista do canhão) aberta. */
  left: boolean;
  right: boolean;
  /** Detectores de caminho ligados nas fendas. */
  detectors: boolean;
  /** Desenhar o feixe, os impactos e a onda; desligado, só o padrão. */
  beamVisible: boolean;
  color: PhosphorColor;
  /** Distância das fendas ao anteparo, m. */
  distance: number;
  /** Largura física do anteparo, m. */
  screenWidth: number;
}

export const INITIAL_DOUBLE_SLIT_STATE: DoubleSlitState = {
  left: true,
  right: true,
  detectors: false,
  beamVisible: true,
  color: 'green',
  distance: DEFAULT_DOUBLE_SLIT.distance,
  screenWidth: DEFAULT_DOUBLE_SLIT.screenWidth,
};

export type DoubleSlitStore = Store<DoubleSlitState>;

export function createDoubleSlitStore(): DoubleSlitStore {
  return createStore<DoubleSlitState>({ ...INITIAL_DOUBLE_SLIT_STATE });
}
