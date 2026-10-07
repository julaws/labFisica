import type { EquationPlateSpec } from '../../scene/textures/equation';

/**
 * Placa da frente da bancada: a forma de um modo da placa quadrada e a
 * frequência dele, que cresce com n² + m² e com a rigidez do aço.
 */
export const CHLADNI_PLATE: EquationPlateSpec = {
  title: 'FIGURAS DE CHLADNI',
  lines: [
    {
      math: [
        'u = cos',
        { frac: ['nπx', 'L'] },
        ' cos',
        { frac: ['mπy', 'L'] },
        ' − cos',
        { frac: ['mπx', 'L'] },
        ' cos',
        { frac: ['nπy', 'L'] },
      ],
      size: 0.17,
    },
    {
      math: [
        { sub: ['f', 'nm'] },
        ' = ',
        { frac: ['π', '2L²'] },
        { sqrt: { frac: ['D', 'ρh'] } },
        ' (n² + m²)        D = ',
        { frac: ['E h³', '12(1 − ν²)'] },
      ],
      size: 0.17,
    },
  ],
  caption:
    'L: lado da placa  ·  h: espessura  ·  E, ρ, ν: o aço  ·  (n, m): o modo  ·  placa circular: u = Jₙ(kr)·cos nθ',
  captionSize: 0.07,
};
