import type { EquationPlateSpec } from '../../scene/textures/equation';

/**
 * Placa da frente da bancada: a órbita da luz em volta do buraco negro e os
 * números que saem dela — o horizonte, o raio crítico (a sombra), a deflexão
 * de campo fraco e o raio do anel de Einstein.
 */
export const BLACK_HOLE_PLATE: EquationPlateSpec = {
  title: 'A LUZ PERTO DE UM BURACO NEGRO',
  lines: [
    {
      math: [
        { frac: ['d²u', 'dφ²'] },
        ' + u = ',
        { frac: ['3GM', 'c²'] },
        ' u²        ',
        { sub: ['r', 's'] },
        ' = ',
        { frac: ['2GM', 'c²'] },
        '        ',
        { sub: ['b', 'c'] },
        ' = 3√3 ',
        { frac: ['GM', 'c²'] },
      ],
      size: 0.2,
    },
    {
      math: [
        'α ≈ ',
        { frac: ['4GM', 'c²b'] },
        '        ',
        { sub: ['θ', 'E'] },
        ' = ',
        {
          sqrt: {
            frac: [
              ['4GM ', { sub: ['D', 'LS'] }],
              ['c² ', { sub: ['D', 'L'] }, ' ', { sub: ['D', 'S'] }],
            ],
          },
        },
      ],
      size: 0.2,
    },
  ],
  caption:
    'u = 1/r  ·  b: parâmetro de impacto  ·  r_s: raio do horizonte  ·  b_c: raio da sombra  ·  D: distâncias até a lente e a fonte',
  captionSize: 0.07,
};
