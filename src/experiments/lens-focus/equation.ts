import type { EquationPlateSpec } from '../../scene/textures/equation';

/**
 * Placa do tampo da bancada: a equação das lentes (forma gaussiana), com a
 * magnificação e o número f, os três números que o experimento mostra.
 */
export const LENS_EQUATION_PLATE: EquationPlateSpec = {
  title: 'EQUAÇÃO DAS LENTES',
  lines: [
    {
      math: [{ frac: ['1', 'f'] }, ' = ', { frac: ['1', 'u'] }, ' + ', { frac: ['1', 'v'] }],
      size: 0.3,
    },
    { math: ['m = −', { frac: ['v', 'u'] }], size: 0.2 },
    { math: ['N = ', { frac: ['f', 'D'] }], size: 0.2 },
  ],
};
