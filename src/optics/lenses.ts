import type { Prescription } from './prescription';
import { opticalLength } from './prescription';
import { analyze } from './paraxial';
import { withFNumber } from './aperture';
import { traceRay } from './trace';
import { LENS_50MM_F2 } from './prescriptions/baker-double-gauss';
import { BICONCAVE_50, BICONVEX_50 } from './prescriptions/singlets';

/**
 * Catálogo de objetivas da troca de lente (ADR 0007).
 *
 * Cada entrada é só uma prescrição: a distância focal, as pupilas, o desenho
 * dos vidros e a aberração esférica saem dela, pelo mesmo motor.
 */

export type LensId = 'double-gauss' | 'biconvex' | 'biconcave';

export const LENS_IDS: readonly LensId[] = ['double-gauss', 'biconvex', 'biconcave'];

export const LENSES: Record<LensId, Prescription> = {
  'double-gauss': LENS_50MM_F2,
  biconvex: BICONVEX_50,
  biconcave: BICONCAVE_50,
};

export interface LensFacts {
  readonly prescription: Prescription;
  /** Distância focal efetiva, mm, com sinal: negativa numa lente divergente. */
  readonly efl: number;
  /** True quando a lente forma imagem real (EFL positiva). */
  readonly converging: boolean;
  /** Comprimento do grupo óptico, mm. */
  readonly length: number;
  /** Plano principal traseiro, medido do último vértice, mm. */
  readonly rearPrincipal: number;
}

const factsCache = new Map<LensId, LensFacts>();

export function lensFacts(id: LensId): LensFacts {
  const cached = factsCache.get(id);
  if (cached) return cached;
  const prescription = LENSES[id];
  const analysis = analyze(prescription);
  const facts: LensFacts = {
    prescription,
    efl: analysis.efl,
    converging: analysis.efl > 0,
    length: opticalLength(prescription.surfaces),
    rearPrincipal: analysis.rearPrincipal,
  };
  factsCache.set(id, facts);
  return facts;
}

const spotCache = new Map<string, number>();

/**
 * Diâmetro do borrão de **aberração esférica** no melhor foco, mm, para um
 * objeto no infinito com o diafragma em f/N.
 *
 * Traça raios reais paralelos ao eixo em várias alturas da pupila e procura,
 * ao longo do eixo, o plano onde o feixe é mais estreito (o "círculo de menor
 * confusão"). O diâmetro do feixe ali é o menor borrão que essa lente consegue
 * fazer de um ponto, mesmo perfeitamente focada. Zero numa lente divergente,
 * que não forma ponto nenhum.
 *
 * Aproximações declaradas (ADR 0007): objeto no infinito para todas as
 * distâncias, só a linha d (sem a cromática), só o feixe no eixo.
 */
export function aberrationSpotDiameter(id: LensId, fNumber: number): number {
  const key = `${id}@${fNumber.toFixed(3)}`;
  const cached = spotCache.get(key);
  if (cached !== undefined) return cached;

  const { efl, converging } = lensFacts(id);
  if (!converging) {
    spotCache.set(key, 0);
    return 0;
  }

  const prescription = withFNumber(LENSES[id], fNumber);
  const pupilRadius = efl / fNumber / 2;
  const rays: { y: number; z: number; slope: number }[] = [];
  const samples = 24;
  for (let k = 1; k <= samples; k += 1) {
    // √ uniformiza a área: cada raio representa um anel de mesma área.
    const h = pupilRadius * Math.sqrt(k / samples) * 0.999;
    const result = traceRay(prescription, { origin: { x: 0, y: h, z: -10 }, direction: { x: 0, y: 0, z: 1 } });
    if (!result.exit) continue;
    const { origin, direction } = result.exit;
    rays.push({ y: origin.y, z: origin.z, slope: direction.y / direction.z });
  }
  if (rays.length < 2) {
    spotCache.set(key, 0);
    return 0;
  }

  // Raio do feixe num plano z: o maior |y| entre os raios.
  const radiusAt = (z: number): number =>
    Math.max(...rays.map((ray) => Math.abs(ray.y + ray.slope * (z - ray.z))));
  // Onde cada raio cruza o eixo; o melhor foco está entre o mais próximo e o
  // mais distante desses cruzamentos.
  const crossings = rays.map((ray) => ray.z - ray.y / ray.slope);
  let lo = Math.min(...crossings);
  let hi = Math.max(...crossings);
  // Busca ternária: o raio do feixe é unimodal entre os dois cruzamentos.
  for (let i = 0; i < 80; i += 1) {
    const a = lo + (hi - lo) / 3;
    const b = hi - (hi - lo) / 3;
    if (radiusAt(a) < radiusAt(b)) hi = b;
    else lo = a;
  }
  const diameter = 2 * radiusAt((lo + hi) / 2);
  spotCache.set(key, diameter);
  return diameter;
}
