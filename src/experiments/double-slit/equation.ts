import type { EquationPlateSpec } from '../../scene/textures/equation';

/**
 * Placa da frente da bancada: a equação de Schrödinger, que rege a onda Ψ de
 * cada elétron. Uma linha só, grande: a placa é larga e baixa.
 */
export const SCHRODINGER_PLATE: EquationPlateSpec = {
  title: 'EQUAÇÃO DE SCHRÖDINGER',
  lines: [
    {
      math: [
        'iħ ',
        { frac: ['∂Ψ', '∂t'] },
        ' = −',
        { frac: [{ sup: ['ħ', '2'] }, '2m'] },
        { sup: ['∇', '2'] },
        'Ψ + VΨ',
      ],
      size: 0.42,
    },
  ],
};
