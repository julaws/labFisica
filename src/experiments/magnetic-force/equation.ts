import type { EquationPlateSpec } from '../../scene/textures/equation';

/**
 * Placa da frente da bancada, como nas do feixe de elétrons e do
 * tunelamento: as equações da força magnética que o experimento mostra — a
 * força de Lorentz, o raio do círculo, o tempo de uma volta e a energia que o
 * canhão dá ao elétron. Título em cima e as equações lado a lado embaixo.
 */
export const MAGNETIC_EQUATION_PLATE: EquationPlateSpec = {
  title: 'FORÇA MAGNÉTICA',
  columns: true,
  lines: [
    { math: [{ vec: 'F' }, ' = q ', { vec: 'v' }, ' × ', { vec: 'B' }], size: 0.36 },
    { math: ['r = ', { frac: ['mv', ['|q|', 'B']] }], size: 0.36 },
    { math: ['T = ', { frac: ['2πm', ['|q|', 'B']] }], size: 0.36 },
    { math: ['eU = ', { frac: ['1', '2'] }, 'm', { sup: ['v', '2'] }], size: 0.36 },
  ],
};
