import type { EquationPlateSpec } from '../../scene/textures/equation';

/**
 * Placa da frente da bancada: a identidade soma-produto que explica o
 * batimento, e a frequência de batimento que sai dela.
 */
export const BEATS_PLATE: EquationPlateSpec = {
  title: 'BATIMENTOS',
  lines: [
    {
      math: [
        'sen(2π',
        { sub: ['f', '1'] },
        't) + sen(2π',
        { sub: ['f', '2'] },
        't) = 2 cos(π(',
        { sub: ['f', '1'] },
        ' − ',
        { sub: ['f', '2'] },
        ')t) · sen(π(',
        { sub: ['f', '1'] },
        ' + ',
        { sub: ['f', '2'] },
        ')t)',
      ],
      size: 0.14,
    },
    {
      math: [
        { sub: ['f', 'bat'] },
        ' = |',
        { sub: ['f', '1'] },
        ' − ',
        { sub: ['f', '2'] },
        '|        ',
        { sub: ['T', 'bat'] },
        ' = ',
        { frac: ['1', ['|', { sub: ['f', '1'] }, ' − ', { sub: ['f', '2'] }, '|']] },
      ],
      size: 0.17,
    },
  ],
  caption: 'f₁, f₂: as frequências dos osciladores  ·  o volume sobe e desce |f₁ − f₂| vezes por segundo',
  captionSize: 0.07,
};
