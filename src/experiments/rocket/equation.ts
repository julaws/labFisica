import type { EquationPlateSpec } from '../../scene/textures/equation';

/**
 * Placa da frente da bancada: a equação de Tsiolkovsky, o empuxo e a
 * equação de movimento de massa variável, com gravidade e arrasto.
 */
export const ROCKET_PLATE: EquationPlateSpec = {
  title: 'A EQUAÇÃO DO FOGUETE',
  lines: [
    {
      math: [
        'Δv = ',
        { sub: ['v', 'e'] },
        ' ln',
        { frac: [{ sub: ['m', '0'] }, { sub: ['m', 'f'] }] },
        '        ',
        { sub: ['v', 'e'] },
        ' = ',
        { sub: ['I', 'sp'] },
        ' ',
        { sub: ['g', '0'] },
        '        F = ',
        { sub: ['v', 'e'] },
        ' ',
        { frac: ['dm', 'dt'] },
      ],
      size: 0.19,
    },
    {
      math: [
        'm ',
        { frac: ['dv', 'dt'] },
        ' = ',
        { sub: ['v', 'e'] },
        ' |',
        { frac: ['dm', 'dt'] },
        '| − m g(h) − ',
        { frac: ['1', '2'] },
        ' ρ ',
        { sub: ['C', 'D'] },
        ' A ',
        { sup: ['v', '2'] },
      ],
      size: 0.17,
    },
  ],
  caption:
    'vₑ: velocidade do gás em relação ao foguete  ·  m₀, m_f: massa no começo e no fim da queima  ·  Isp: impulso específico',
  captionSize: 0.07,
};
