import type { EquationPlateSpec } from '../../scene/textures/equation';

/**
 * Placa do tampo: as equações da força magnética que o experimento mostra —
 * a força de Lorentz, o raio do círculo, o seletor de velocidades e a energia
 * que o canhão dá ao elétron.
 */
export const MAGNETIC_EQUATION_PLATE: EquationPlateSpec = {
  title: 'FORÇA MAGNÉTICA',
  lines: [
    { math: [{ vec: 'F' }, ' = q ', { vec: 'v' }, ' × ', { vec: 'B' }], size: 0.2 },
    { math: ['r = ', { frac: ['mv', ['|q|', 'B']] }], size: 0.17 },
    { math: ['v = ', { frac: ['E', 'B'] }], size: 0.17 },
    { math: ['eU = ', { frac: ['1', '2'] }, 'm', { sup: ['v', '2'] }], size: 0.15 },
  ],
};
