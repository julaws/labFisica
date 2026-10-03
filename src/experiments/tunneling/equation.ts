import type { EquationPlateSpec } from '../../scene/textures/equation';

/**
 * Placa da frente da bancada: a corrente de tunelamento. A corrente que passa
 * é a fração T do feixe; para barreira larga, T cai com a exponencial de 2κa —
 * a mesma lei que faz o microscópio de tunelamento medir distâncias atômicas.
 */
export const TUNNELING_PLATE: EquationPlateSpec = {
  title: 'CORRENTE DE TUNELAMENTO',
  lines: [
    {
      math: [
        'I = ',
        { sub: ['I', '0'] },
        ' T  ≈  ',
        { sub: ['I', '0'] },
        ' ',
        { frac: [['16E(', { sub: ['V', '0'] }, ' − E)'], { sup: [{ sub: ['V', '0'] }, '2'] }] },
        ' ',
        { sup: ['e', '−2κa'] },
      ],
      size: 0.3,
    },
    {
      math: ['κ = ', { frac: [{ sqrt: ['2m(', { sub: ['V', '0'] }, ' − E)'] }, 'ħ'] }],
      size: 0.24,
    },
  ],
};
