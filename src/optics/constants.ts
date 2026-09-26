/**
 * Constantes do experimento 1 (SPEC §5.1). Nada aqui é "número mágico de cena":
 * são os parâmetros físicos configuráveis do laboratório.
 */

/** Distância focal padrão da objetiva do experimento 1, em mm. */
export const DEFAULT_FOCAL_LENGTH_MM = 50;

/** Sensor full-frame, em mm. */
export const FULL_FRAME_SENSOR = { w: 36, h: 24 } as const;

/**
 * Círculo de confusão admissível, em mm.
 * `reference` reproduz os números do site de referência (SPEC §5.1);
 * `strict` é o valor clássico para full-frame, oferecido no painel "Números".
 */
export const COC_MM = { reference: 0.036, strict: 0.03 } as const;

/** Escala de stops completos f/1.4 … f/22 (SPEC §2). */
export const F_STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22] as const;

/** Atalhos de abertura do painel (SPEC §2). */
export const F_STOP_PRESETS = [2, 5.6, 16] as const;

/** Linhas espectrais de trabalho, em nm (SPEC §5.4). */
export const WAVELENGTHS_NM = { F: 486.13, d: 587.56, C: 656.27 } as const;

/** Distâncias físicas padrão dos objetos do diorama, em mm (SPEC §6.2). */
export const DEFAULT_SUBJECT_DISTANCES_MM = {
  foreground: 370,
  midground: 600,
  background: 2000,
} as const;

/** Faixa do anel de foco, em mm (SPEC §6.2). */
export const FOCUS_RANGE_MM = { min: 300, max: 10_000 } as const;
