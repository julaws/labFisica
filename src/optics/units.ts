/**
 * Unidades do motor óptico. Internamente **tudo é milímetro** (CLAUDE.md §3);
 * as conversões existem só nas bordas (UI e cena).
 */

export const MM_PER_CM = 10;
export const MM_PER_M = 1000;

export const cmToMm = (cm: number): number => cm * MM_PER_CM;
export const mmToCm = (mm: number): number => mm / MM_PER_CM;
export const mToMm = (m: number): number => m * MM_PER_M;
export const mmToM = (mm: number): number => mm / MM_PER_M;

/** Comprimento de onda em nanômetros → micrômetros (entrada da equação de Sellmeier). */
export const nmToUm = (nm: number): number => nm / 1000;

/** Limita um valor ao intervalo [min, max]. */
export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);
