import { COC_MM, DEFAULT_FOCAL_LENGTH_MM, F_STOPS, FULL_FRAME_SENSOR } from '../../optics/constants';
import { type Store, createStore } from '../../core/store';
import { clamp } from '../../optics/units';
import type { LensId } from '../../optics/lenses';

/** Objetos do vale que emitem leques de raios. */
export type RaySubject = 'foreground' | 'midground' | 'background';

export const RAY_SUBJECTS: readonly RaySubject[] = ['foreground', 'midground', 'background'];

/** Estado central do experimento 1 (SPEC §6.3). */
export interface LensFocusState {
  /** Distância de foco, em mm. `Infinity` é a posição ∞ do anel. */
  focusDistance: number;
  fNumber: number;
  lensMode: 'assembled' | 'exploded';
  opticsMode: 'thin' | 'real';
  showNumbers: boolean;
  cinematic: boolean;
  uiHidden: boolean;
  /** Círculo de confusão admissível, em mm. */
  coc: number;
  /** Objetiva montada (ADR 0007). */
  lens: LensId;
  /** Quais objetos do vale mostram o leque de raios (e o anel no vidro). */
  rays: Record<RaySubject, boolean>;
  /**
   * Distância focal da objetiva montada, em mm, com sinal: negativa numa
   * lente divergente. Acompanha `lens`.
   */
  focalLength: number;
  sensor: { w: number; h: number };
}

export const INITIAL_STATE: LensFocusState = {
  focusDistance: 600,
  fNumber: 2,
  // Explodida por padrão: é a vista que mostra os vidros um a um.
  lensMode: 'exploded',
  opticsMode: 'thin',
  showNumbers: false,
  cinematic: false,
  uiHidden: false,
  coc: COC_MM.reference,
  lens: 'double-gauss',
  rays: { foreground: true, midground: true, background: true },
  focalLength: DEFAULT_FOCAL_LENGTH_MM,
  sensor: { ...FULL_FRAME_SENSOR },
};

export type LensFocusStore = Store<LensFocusState>;

export function createLensFocusStore(overrides: Partial<LensFocusState> = {}): LensFocusStore {
  return createStore<LensFocusState>({ ...INITIAL_STATE, ...overrides });
}

/**
 * Próximo número f da escala de stops completos, no sentido pedido.
 * Usado pela tecla `F` e pelos botões do painel.
 */
export function stepFNumber(current: number, direction: 1 | -1): number {
  const stops = [...F_STOPS];
  let nearest = 0;
  let best = Infinity;

  stops.forEach((stop, index) => {
    const distance = Math.abs(Math.log(stop) - Math.log(current));
    if (distance < best) {
      best = distance;
      nearest = index;
    }
  });

  const next = clamp(nearest + direction, 0, stops.length - 1);
  return stops[next]!;
}
