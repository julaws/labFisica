import { AIR, refractiveIndex } from './glass';
import { WAVELENGTHS_NM } from './constants';
import { type Prescription, type Surface, stopIndex, vertexPositions } from './prescription';

/**
 * Análise paraxial por matrizes ABCD (SPEC §5.3).
 *
 * Trabalhamos com o par (y, ω), onde `y` é a altura do raio e `ω = n·u` é o
 * ângulo reduzido. Nessa convenção:
 *
 *   refração numa superfície de potência P = (n' − n)/R:  [[1, 0], [−P, 1]]
 *   translação de t num meio de índice n:                 [[1, t/n], [0, 1]]
 *
 * Com a matriz total M = [[A, B], [C, D]] e o sistema imerso em ar:
 *
 *   potência equivalente  Φ = −C          distância focal  f = −1/C
 *   distância focal traseira (do último vértice)  BFD = −A/C
 *   plano principal traseiro (do último vértice)  (1 − A)/C
 *   plano principal dianteiro (do primeiro vértice)  (D − 1)/C
 */

/** Matriz 2×2 na ordem [A, B, C, D]. */
export type Matrix2 = readonly [number, number, number, number];

export const IDENTITY: Matrix2 = [1, 0, 0, 1];

/** Produto `a · b` (aplica b primeiro). */
export function multiply(a: Matrix2, b: Matrix2): Matrix2 {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
  ];
}

/** Matriz de refração de uma superfície de raio `radius` entre os índices n e n'. */
export function refractionMatrix(radius: number, n: number, nPrime: number): Matrix2 {
  const power = Number.isFinite(radius) ? (nPrime - n) / radius : 0;
  return [1, 0, -power, 1];
}

/** Matriz de translação de `thickness` num meio de índice `n`. */
export function transferMatrix(thickness: number, n: number): Matrix2 {
  return [1, thickness / n, 0, 1];
}

/** Índice do meio que precede a superfície `index`. */
function indexBefore(surfaces: readonly Surface[], index: number, wavelengthNm: number): number {
  if (index === 0) return 1;
  return refractiveIndex(surfaces[index - 1]!.material, wavelengthNm);
}

/** Índice do meio que segue a superfície `index`. */
function indexAfter(surfaces: readonly Surface[], index: number, wavelengthNm: number): number {
  return refractiveIndex(surfaces[index]!.material, wavelengthNm);
}

/**
 * Matriz do subsistema que vai da superfície `from` até a superfície `to`,
 * ambas inclusive. Sem argumentos, cobre o sistema inteiro.
 */
export function systemMatrix(
  surfaces: readonly Surface[],
  wavelengthNm: number = WAVELENGTHS_NM.d,
  from = 0,
  to = surfaces.length - 1,
): Matrix2 {
  let m: Matrix2 = IDENTITY;

  for (let i = from; i <= to; i += 1) {
    const n = indexBefore(surfaces, i, wavelengthNm);
    const nPrime = indexAfter(surfaces, i, wavelengthNm);
    m = multiply(refractionMatrix(surfaces[i]!.radius, n, nPrime), m);

    if (i < to) {
      m = multiply(transferMatrix(surfaces[i]!.thickness, nPrime), m);
    }
  }

  return m;
}

export interface ParaxialAnalysis {
  /** Distância focal efetiva, mm. */
  efl: number;
  /** Distância focal traseira, medida do último vértice, mm. */
  bfl: number;
  /** Distância focal dianteira, medida do primeiro vértice, mm (negativa = à esquerda). */
  ffl: number;
  /** Plano principal traseiro, medido do último vértice, mm. */
  rearPrincipal: number;
  /** Plano principal dianteiro, medido do primeiro vértice, mm. */
  frontPrincipal: number;
  /** Pupila de entrada: posição em z (referida ao primeiro vértice) e diâmetro, mm. */
  entrancePupil: { z: number; diameter: number };
  /** Pupila de saída: posição em z (referida ao primeiro vértice) e diâmetro, mm. */
  exitPupil: { z: number; diameter: number };
  /** Número f no infinito, EFL / diâmetro da pupila de entrada. */
  fNumber: number;
  matrix: Matrix2;
}

/** Estado de um raio paraxial: altura e ângulo reduzido. */
export interface ParaxialRay {
  y: number;
  omega: number;
}

/**
 * Traça um raio paraxial pelas superfícies `from`..`to`, na ordem da luz.
 * Devolve o estado após a última superfície do intervalo.
 */
export function traceParaxial(
  surfaces: readonly Surface[],
  ray: ParaxialRay,
  wavelengthNm: number = WAVELENGTHS_NM.d,
  from = 0,
  to = surfaces.length - 1,
): ParaxialRay {
  const m = systemMatrix(surfaces, wavelengthNm, from, to);
  return { y: m[0] * ray.y + m[1] * ray.omega, omega: m[2] * ray.y + m[3] * ray.omega };
}

/**
 * Imagem paraxial de um plano transversal através de um subsistema, usada para
 * localizar as pupilas. `objectZ` é medido a partir do vértice de `from`,
 * positivo para a direita.
 *
 * Devolve a posição da imagem medida a partir do vértice de `to` e a
 * magnificação transversal.
 */
function imagePlane(
  surfaces: readonly Surface[],
  objectZ: number,
  wavelengthNm: number,
  from: number,
  to: number,
): { z: number; magnification: number } {
  const nObject = indexBefore(surfaces, from, wavelengthNm);
  const nImage = indexAfter(surfaces, to, wavelengthNm);

  // Translação do plano-objeto até a primeira superfície, o subsistema, e
  // depois procuramos a translação que anula o termo B (condição de imagem).
  const m = multiply(systemMatrix(surfaces, wavelengthNm, from, to), transferMatrix(-objectZ, nObject));

  // M_total = T(d) · m = [[A + (d/n')·C, B + (d/n')·D], [C, D]].
  // Queremos B_total = 0 → d = −B/D · n'. (Até 01/10/2026 isto usava A no
  // lugar de D, o que deslocava as duas pupilas; ver ADR 0005.)
  const b = m[1];
  const dTerm = m[3];
  if (dTerm === 0) return { z: Infinity, magnification: 0 };

  const d = (-b / dTerm) * nImage;
  const total = multiply(transferMatrix(d, nImage), m);

  return { z: d, magnification: total[0] };
}

/** Análise paraxial completa do sistema. */
export function analyze(
  prescription: Prescription,
  wavelengthNm: number = WAVELENGTHS_NM.d,
): ParaxialAnalysis {
  const surfaces = prescription.surfaces;
  const last = surfaces.length - 1;
  const m = systemMatrix(surfaces, wavelengthNm);
  const [a, , c, d] = m;

  const efl = -1 / c;
  const bfl = -a / c;
  const ffl = d / c;
  const rearPrincipal = (1 - a) / c;
  const frontPrincipal = (d - 1) / c;

  const vertices = vertexPositions(surfaces);
  const stop = stopIndex(surfaces);
  const stopZ = vertices[stop]!;
  const stopRadius = surfaces[stop]!.semiDiameter;

  // Pupila de entrada: imagem do stop pelas superfícies que vêm antes dele,
  // vista do espaço-objeto (traçado reverso).
  let entrancePupil = { z: stopZ, diameter: stopRadius * 2 };
  if (stop > 0) {
    const reversed = reversePrescriptionSurfaces(surfaces, 0, stop - 1, wavelengthNm);
    // No sistema revertido, o stop está a esta distância da primeira superfície.
    const distanceToStop = stopZ - vertices[stop - 1]!;
    const image = imagePlane(reversed, -distanceToStop, wavelengthNm, 0, reversed.length - 1);
    entrancePupil = {
      z: vertices[0]! - image.z,
      diameter: Math.abs(image.magnification) * stopRadius * 2,
    };
  }

  // Pupila de saída: imagem do stop pelas superfícies posteriores.
  let exitPupil = { z: stopZ, diameter: stopRadius * 2 };
  if (stop < last) {
    const distanceToStop = stopZ - vertices[stop + 1]!;
    const image = imagePlane(surfaces, distanceToStop, wavelengthNm, stop + 1, last);
    exitPupil = {
      z: vertices[last]! + image.z,
      diameter: Math.abs(image.magnification) * stopRadius * 2,
    };
  }

  return {
    efl,
    bfl,
    ffl,
    rearPrincipal,
    frontPrincipal,
    entrancePupil,
    exitPupil,
    fNumber: efl / entrancePupil.diameter,
    matrix: m,
  };
}

/**
 * Inverte a ordem e os sinais de um trecho de superfícies, para traçar da
 * direita para a esquerda (usado na pupila de entrada).
 */
function reversePrescriptionSurfaces(
  surfaces: readonly Surface[],
  from: number,
  to: number,
  wavelengthNm: number,
): Surface[] {
  const slice = surfaces.slice(from, to + 1);
  const reversed: Surface[] = [];

  for (let i = slice.length - 1; i >= 0; i -= 1) {
    const surface = slice[i]!;
    // O meio que segue a superfície no sistema revertido é o que a precedia.
    const previousMaterial = i === 0 ? AIR : slice[i - 1]!.material;
    reversed.push({
      radius: Number.isFinite(surface.radius) ? -surface.radius : Infinity,
      thickness: i === 0 ? 0 : slice[i - 1]!.thickness,
      material: previousMaterial,
      semiDiameter: surface.semiDiameter,
      isStop: false,
    });
  }

  void wavelengthNm;
  return reversed;
}

/**
 * Conjugados do sistema espesso: dado um objeto a `u` mm à frente do plano
 * principal dianteiro, devolve a distância da imagem ao plano principal
 * traseiro e o deslocamento do grupo óptico necessário para focar (SPEC §5.3,
 * foco por deslocamento unitário).
 */
export function focusShift(analysis: ParaxialAnalysis, objectDistanceMm: number): number {
  const f = analysis.efl;
  if (!Number.isFinite(objectDistanceMm)) return 0;
  return (f * objectDistanceMm) / (objectDistanceMm - f) - f;
}
