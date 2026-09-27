import type { Glass } from './glass';
import { AIR } from './glass';

/**
 * Descrição de um sistema óptico sequencial (SPEC §5.3).
 *
 * Uma prescrição é uma lista de superfícies esféricas na ordem em que a luz as
 * encontra. Cada superfície guarda o meio que vem **depois** dela, que é como
 * os catálogos e as patentes tabelam.
 *
 * A mesma prescrição alimenta o traçado de raios, a análise paraxial e a
 * geometria 3D dos elementos de vidro (SPEC §6.4): a lente desenhada é a lente
 * simulada.
 */
export interface Surface {
  /** Raio de curvatura, mm. Positivo = centro à direita do vértice. `Infinity` = plano. */
  readonly radius: number;
  /** Distância axial até a próxima superfície, mm. */
  readonly thickness: number;
  /** Meio entre esta superfície e a próxima. */
  readonly material: Glass;
  /** Semidiâmetro livre, mm. Um raio que chega além disso é bloqueado. */
  readonly semiDiameter: number;
  /** True na superfície que carrega o stop de abertura. */
  readonly isStop: boolean;
}

export interface Prescription {
  readonly id: string;
  readonly label: string;
  readonly surfaces: readonly Surface[];
  /** Origem dos números. Obrigatório: SPEC §13 proíbe constante sem fonte. */
  readonly source: string;
  /** Como a prescrição foi obtida ou derivada, em pt-BR. */
  readonly notes: string;
}

/** Posição axial (z) do vértice de cada superfície, com a primeira em z = 0. */
export function vertexPositions(surfaces: readonly Surface[]): number[] {
  const positions: number[] = [];
  let z = 0;
  for (const surface of surfaces) {
    positions.push(z);
    z += surface.thickness;
  }
  return positions;
}

/** Índice da superfície que carrega o stop de abertura. */
export function stopIndex(surfaces: readonly Surface[]): number {
  const index = surfaces.findIndex((s) => s.isStop);
  if (index < 0) throw new Error('A prescrição não declara nenhuma superfície como stop');
  return index;
}

/** Comprimento total do grupo óptico, do primeiro vértice ao último, mm. */
export function opticalLength(surfaces: readonly Surface[]): number {
  return surfaces.slice(0, -1).reduce((sum, s) => sum + s.thickness, 0);
}

/**
 * Escala toda a prescrição por um fator. Como a potência é inversamente
 * proporcional ao comprimento, escalar raios e espessuras pelo mesmo fator
 * multiplica a distância focal pelo fator, sem mexer nas aberrações relativas.
 */
export function scalePrescription(prescription: Prescription, factor: number): Prescription {
  return {
    ...prescription,
    surfaces: prescription.surfaces.map((s) => ({
      ...s,
      radius: Number.isFinite(s.radius) ? s.radius * factor : s.radius,
      thickness: s.thickness * factor,
      semiDiameter: s.semiDiameter * factor,
    })),
  };
}

/**
 * Agrupa as superfícies em elementos de vidro contíguos.
 * Serve para gerar os sólidos de revolução da F3: cada elemento vira uma peça,
 * e elementos cimentados compartilham a superfície comum.
 */
export interface Element {
  /** Índices das superfícies que limitam o elemento, na ordem da luz. */
  readonly surfaceIndices: readonly number[];
  readonly material: Glass;
}

export function glassElements(surfaces: readonly Surface[]): Element[] {
  const elements: Element[] = [];

  for (let i = 0; i < surfaces.length - 1; i += 1) {
    const surface = surfaces[i]!;
    if (surface.material === AIR) continue;
    elements.push({ surfaceIndices: [i, i + 1], material: surface.material });
  }

  return elements;
}
