import { nmToUm } from './units';
import { WAVELENGTHS_NM } from './constants';

/**
 * Vidros ópticos e dispersão (SPEC §5.4).
 *
 * Equação de Sellmeier, com λ em micrômetros:
 *
 *     n²(λ) − 1 = Σᵢ Bᵢ λ² / (λ² − Cᵢ)
 *
 * Todos os coeficientes vêm da base pública do refractiveindex.info
 * (licença CC0 1.0), que por sua vez os obtém do catálogo Zemax da SCHOTT.
 * A fonte exata de cada vidro está em `docs/optics-sources.md`.
 */

export interface SellmeierCoefficients {
  /** Termos Bᵢ (adimensionais). */
  readonly b: readonly [number, number, number];
  /** Termos Cᵢ, em µm². */
  readonly c: readonly [number, number, number];
}

export interface Glass {
  readonly name: string;
  readonly sellmeier: SellmeierCoefficients;
  /** Faixa de validade da fórmula, em µm. */
  readonly validRangeUm: readonly [number, number];
  /** De onde vieram os coeficientes (ver docs/optics-sources.md). */
  readonly source: string;
}

const SCHOTT_2017 =
  'refractiveindex.info (CC0 1.0), catálogo Zemax SCHOTT 2017-01-20b';

/** Ar: tratado como n = 1 exatamente; o motor trabalha em índice relativo ao ar. */
export const AIR: Glass = {
  name: 'ar',
  sellmeier: { b: [0, 0, 0], c: [0, 0, 0] },
  validRangeUm: [0.1, 100],
  source: 'convenção: índice relativo ao ar, n = 1',
};

export const GLASSES = {
  'N-BK7': {
    name: 'N-BK7',
    sellmeier: {
      b: [1.03961212, 0.231792344, 1.01046945],
      c: [0.00600069867, 0.0200179144, 103.560653],
    },
    validRangeUm: [0.3, 2.5],
    source: SCHOTT_2017,
  },
  'N-SF2': {
    name: 'N-SF2',
    sellmeier: {
      b: [1.47343127, 0.163681849, 1.36920899],
      c: [0.0109019098, 0.0585683687, 127.404933],
    },
    validRangeUm: [0.365, 2.5],
    source: SCHOTT_2017,
  },
  'N-SF5': {
    name: 'N-SF5',
    sellmeier: {
      b: [1.52481889, 0.187085527, 1.42729015],
      c: [0.011254756, 0.0588995392, 129.141675],
    },
    validRangeUm: [0.37, 2.5],
    source: SCHOTT_2017,
  },
  'N-SK16': {
    name: 'N-SK16',
    sellmeier: {
      b: [1.34317774, 0.241144399, 0.994317969],
      c: [0.00704687339, 0.0229005, 92.7508526],
    },
    validRangeUm: [0.31, 2.5],
    source: SCHOTT_2017,
  },
  'N-LAK22': {
    name: 'N-LAK22',
    sellmeier: {
      b: [1.14229781, 0.535138441, 1.04088385],
      c: [0.00585778594, 0.0198546147, 100.834017],
    },
    validRangeUm: [0.31, 2.5],
    source: SCHOTT_2017,
  },
} as const satisfies Record<string, Glass>;

export type GlassName = keyof typeof GLASSES;

/** Busca um vidro do catálogo pelo nome. */
export function glass(name: GlassName): Glass {
  return GLASSES[name];
}

/**
 * Índice de refração de um vidro no comprimento de onda dado (nm).
 * O ar devolve 1 exatamente.
 */
export function refractiveIndex(material: Glass, wavelengthNm: number): number {
  if (material === AIR) return 1;

  const lambda = nmToUm(wavelengthNm);
  const l2 = lambda * lambda;
  const { b, c } = material.sellmeier;

  const n2 =
    1 + (b[0] * l2) / (l2 - c[0]) + (b[1] * l2) / (l2 - c[1]) + (b[2] * l2) / (l2 - c[2]);

  return Math.sqrt(n2);
}

/** Índice na linha d (587,56 nm), que é o valor "nominal" de catálogo. */
export function indexD(material: Glass): number {
  return refractiveIndex(material, WAVELENGTHS_NM.d);
}

/**
 * Número de Abbe: V_d = (n_d − 1) / (n_F − n_C).
 * Mede quanto o vidro dispersa: quanto maior, menos dispersão.
 */
export function abbeNumber(material: Glass): number {
  if (material === AIR) return Infinity;
  const nd = refractiveIndex(material, WAVELENGTHS_NM.d);
  const nF = refractiveIndex(material, WAVELENGTHS_NM.F);
  const nC = refractiveIndex(material, WAVELENGTHS_NM.C);
  return (nd - 1) / (nF - nC);
}
