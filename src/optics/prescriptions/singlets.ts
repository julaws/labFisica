import { AIR, GLASSES, type Glass } from '../glass';
import type { Prescription, Surface } from '../prescription';
import { analyze } from '../paraxial';

/**
 * Lentes simples do experimento de troca de objetiva (ADR 0007): uma
 * **biconvexa** (convergente, +50 mm) e uma **bicôncava** (divergente,
 * −50 mm), as duas de N-BK7, simétricas, com o diafragma logo à frente.
 *
 * ## O que é derivado e o que é escolha de projeto
 *
 * Nenhum raio é digitado à mão. As escolhas declaradas são: o vidro (N-BK7, o
 * vidro óptico mais comum, já no catálogo), a forma simétrica (R₂ = −R₁), o
 * semidiâmetro livre (13,5 mm, para caber a pupila de f/2 de uma 50 mm, 25 mm),
 * a espessura mínima (1,5 mm na borda da convexa, no centro da côncava) e a
 * folga de 2 mm entre o diafragma e o vidro. O raio sai por bissecção até a
 * **EFL paraxial da lente espessa** dar exatamente ±50 mm, e a espessura
 * central da convexa acompanha o raio para manter a borda.
 *
 * Uma lente simples não corrige nada: tem aberração esférica e cromática bem
 * maiores que o Gauss duplo. É exatamente isso que a troca de objetiva quer
 * mostrar.
 */

export type SingletKind = 'biconvex' | 'biconcave';

export interface SingletDesign {
  readonly kind: SingletKind;
  readonly glass: Glass;
  /** Distância focal alvo, em módulo, mm. O sinal sai do tipo. */
  readonly focalLength: number;
  /** Semidiâmetro livre do vidro, mm. */
  readonly semiDiameter: number;
  /** Semidiâmetro do diafragma totalmente aberto, mm. */
  readonly stopSemiDiameter: number;
  /** Espessura mínima do vidro (borda na convexa, centro na côncava), mm. */
  readonly minThickness: number;
  /** Folga entre o diafragma e o primeiro vértice, mm. */
  readonly stopGap: number;
}

export const DEFAULT_SINGLET: Omit<SingletDesign, 'kind'> = {
  glass: GLASSES['N-BK7'],
  focalLength: 50,
  semiDiameter: 13.5,
  stopSemiDiameter: 12.5,
  minThickness: 1.5,
  stopGap: 2,
};

/** Sagita de uma esfera de raio |R| na altura h, sempre positiva, mm. */
function sagMagnitude(radius: number, h: number): number {
  const r = Math.abs(radius);
  return r - Math.sqrt(Math.max(r * r - h * h, 0));
}

function build(design: SingletDesign, radius: number): Prescription {
  const convex = design.kind === 'biconvex';
  const r1 = convex ? radius : -radius;
  // Biconvexa: a espessura central soma as duas sagitas à borda mínima.
  // Bicôncava: o centro é o ponto mais fino.
  const thickness = convex
    ? design.minThickness + 2 * sagMagnitude(radius, design.semiDiameter)
    : design.minThickness;

  const surfaces: Surface[] = [
    {
      radius: Infinity,
      thickness: design.stopGap,
      material: AIR,
      semiDiameter: design.stopSemiDiameter,
      isStop: true,
    },
    { radius: r1, thickness, material: design.glass, semiDiameter: design.semiDiameter, isStop: false },
    { radius: -r1, thickness: 0, material: AIR, semiDiameter: design.semiDiameter, isStop: false },
  ];

  const name = convex ? 'Lente biconvexa' : 'Lente bicôncava';
  const sign = convex ? '' : '−';
  return {
    id: `${design.kind}-${design.focalLength}`,
    label: `${name} simples de ${design.glass.name} · ${sign}${design.focalLength} mm`,
    surfaces,
    source:
      `Geometria derivada em src/optics/prescriptions/singlets.ts (forma simétrica, raio por ` +
      `bissecção sobre a EFL); índice do ${design.glass.name} via refractiveindex.info (CC0 1.0). ` +
      'Ver docs/optics-sources.md §8.',
    notes:
      'Lente simples de laboratório, sem correção de aberrações. Serve para comparar com o ' +
      'Gauss duplo na troca de objetiva (ADR 0007).',
  };
}

/** Resolve o raio que dá a distância focal pedida (com sinal) e monta a lente. */
export function designSinglet(design: SingletDesign): Prescription {
  const target = design.kind === 'biconvex' ? design.focalLength : -design.focalLength;
  const eflFor = (radius: number): number => analyze(build(design, radius)).efl;

  // |EFL| cresce com o raio nas duas formas: bissecção sobre |EFL| − |alvo|.
  let lo = design.semiDiameter * 1.05;
  let hi = 2000;
  for (let i = 0; i < 100; i += 1) {
    const mid = (lo + hi) / 2;
    if (Math.abs(eflFor(mid)) < Math.abs(target)) lo = mid;
    else hi = mid;
  }
  return build(design, (lo + hi) / 2);
}

export const BICONVEX_50: Prescription = designSinglet({ ...DEFAULT_SINGLET, kind: 'biconvex' });
export const BICONCAVE_50: Prescription = designSinglet({ ...DEFAULT_SINGLET, kind: 'biconcave' });
