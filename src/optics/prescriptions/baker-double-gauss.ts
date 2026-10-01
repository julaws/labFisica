import { AIR, GLASSES, type Glass, refractiveIndex } from '../glass';
import { WAVELENGTHS_NM } from '../constants';
import type { Prescription, Surface } from '../prescription';
import { analyze } from '../paraxial';

/**
 * Objetiva do experimento 1: **Gauss duplo de seis elementos, 50 mm f/2**, da
 * patente **US 2.532.751** (James G. Baker, Perkin-Elmer, concedida em
 * 5/12/1950), Exemplo 1 / Fig. 1. Patente americana expirada: os números são
 * de domínio público.
 *
 * ## De onde vem cada número
 *
 * - **Raios e espessuras:** transcritos da tabela da patente (F = 1,000, f/2),
 *   lida na imagem escaneada do documento, e não no OCR — que é o que tinha
 *   inviabilizado esta fonte antes (ADR 0002). A tabela aparece duas vezes na
 *   patente, no desenho (p. 1) e impressa no texto (col. 6); as duas foram
 *   conferidas uma contra a outra. Única divergência: o ν do elemento III é
 *   38,9 no desenho e 38,0 na tabela impressa; vale a impressa, que também
 *   bate com o elemento IV, do mesmo vidro.
 * - **Vidros:** a patente dá (n_d, ν). A SPEC §5.4 pede coeficientes de
 *   catálogo, então cada par vira o vidro SCHOTT mais próximo (catálogo
 *   2017, via refractiveindex.info, CC0): 1,617/55,0 → N-SSK2,
 *   1,611/57,2 → N-SK4, 1,605/38,0 → F5, 1,620/60,3 → N-SK16.
 * - **Diafragma:** a patente não cota a posição; a Fig. 1 o desenha no meio do
 *   espaço central S₂, e é lá que ele fica.
 * - **Escala:** a EFL calculada com os vidros do catálogo dá 0,996 (a patente
 *   diz 1,000 com os vidros dela); tudo é multiplicado pelo fator que leva a
 *   EFL a 50,000 mm.
 * - **Diâmetros livres:** a patente não os dá. São derivados aqui pela regra
 *   descrita em `clearSemiDiameters`, com o stop dimensionado para f/2, a
 *   abertura nominal da patente.
 */

/** Uma linha da tabela da patente, em unidades de F = 1. */
interface PatentRow {
  /** Raio de curvatura; `Infinity` para "plano"; `'stop'` para o diafragma. */
  readonly radius: number | 'stop';
  /** Espessura ou espaço de ar até a próxima superfície. */
  readonly thickness: number;
  /** Vidro entre esta superfície e a próxima; `null` para ar. */
  readonly glass: Glass | null;
}

/**
 * A tabela do Exemplo 1, na ordem da luz. O espaço S₂ = 0,282 aparece partido
 * em duas metades de 0,141, com o diafragma entre elas.
 */
export const BAKER_PATENT_TABLE: readonly PatentRow[] = [
  { radius: 0.578, thickness: 0.088, glass: GLASSES['N-SSK2'] }, // R1, t1 · I
  { radius: 1.896, thickness: 0.003, glass: null }, //               R2, S1
  { radius: 0.351, thickness: 0.125, glass: GLASSES['N-SK4'] }, //  R3, t2 · II
  { radius: Infinity, thickness: 0.038, glass: GLASSES.F5 }, //     R4, t3 · III (cimentado)
  { radius: 0.216, thickness: 0.141, glass: null }, //              R5, S2/2
  { radius: 'stop', thickness: 0.141, glass: null }, //             diafragma, S2/2
  { radius: -0.272, thickness: 0.038, glass: GLASSES.F5 }, //       R6, t4 · IV
  { radius: Infinity, thickness: 0.109, glass: GLASSES['N-SK16'] }, // R7, t5 · V (cimentado)
  { radius: -0.352, thickness: 0.003, glass: null }, //             R8, S3
  { radius: 5.902, thickness: 0.069, glass: GLASSES['N-SK16'] }, // R9, t6 · VI
  { radius: -0.635, thickness: 0, glass: null }, //                 R10
];

/** Abertura nominal da patente. */
export const BAKER_F_NUMBER = 2;

/** Distância focal alvo do experimento, mm (SPEC §5). */
const TARGET_EFL_MM = 50;

/**
 * Meio campo do raio principal usado para dimensionar os elementos, em graus.
 * Escolha de projeto (não vem da patente): até 10° fora do eixo — um círculo
 * de 18 mm no centro do quadro full frame — o feixe de f/2 passa inteiro. Além
 * disso a lente vinheta, como toda objetiva rápida real.
 */
export const CLEAR_FIELD_DEGREES = 10;

/** Espessura mínima de borda aceita para um elemento, mm. */
export const MIN_EDGE_MM = 0.5;

/** Converte a tabela para superfícies em mm, com um semidiâmetro provisório. */
function tableToSurfaces(scale: number, semiDiameter: (index: number) => number): Surface[] {
  return BAKER_PATENT_TABLE.map((row, index) => ({
    radius: row.radius === 'stop' ? Infinity : row.radius * scale,
    thickness: row.thickness * scale,
    material: row.glass ?? AIR,
    semiDiameter: semiDiameter(index),
    isStop: row.radius === 'stop',
  }));
}

/**
 * Traça um raio paraxial (y, ω = n·u) e devolve a altura em cada superfície,
 * antes da refração nela.
 */
function paraxialHeights(surfaces: readonly Surface[], y0: number, omega0: number): number[] {
  const heights: number[] = [];
  let y = y0;
  let omega = omega0;
  let n = 1;
  for (const surface of surfaces) {
    heights.push(y);
    const nNext = refractiveIndex(surface.material, WAVELENGTHS_NM.d);
    if (Number.isFinite(surface.radius)) omega -= (y * (nNext - n)) / surface.radius;
    y += (surface.thickness * omega) / nNext;
    n = nNext;
  }
  return heights;
}

/** Sagita de uma superfície esférica na altura h (positiva = para trás). */
function sag(radius: number, h: number): number {
  if (!Number.isFinite(radius)) return 0;
  return radius - Math.sign(radius) * Math.sqrt(Math.max(radius * radius - h * h, 0));
}

/**
 * Semidiâmetros livres, derivados (a patente não os dá):
 *
 * 1. cada superfície precisa deixar passar o raio marginal de f/2 no eixo
 *    **somado** ao raio principal a `CLEAR_FIELD_DEGREES` — o envelope do
 *    feixe até esse campo;
 * 2. cada **componente** (elemento solto ou par cimentado) tem um só diâmetro
 *    externo, o maior envelope entre as suas superfícies; uma superfície cuja
 *    esfera não chega a esse diâmetro termina num ressalto plano, como os
 *    meniscos III e IV no desenho da patente;
 * 3. o diâmetro do componente é limitado ao ponto em que a borda de algum dos
 *    seus elementos chegaria a `MIN_EDGE_MM`: vidro mais largo não existe;
 * 4. o stop fica com o raio marginal de f/2, o que dá exatamente a abertura
 *    nominal da patente.
 */
function clearSemiDiameters(surfaces: readonly Surface[]): number[] {
  const { entrancePupil } = analyze({ ...BAKER_STUB, surfaces });
  const pupilRadius = TARGET_EFL_MM / BAKER_F_NUMBER / 2;
  const u = Math.tan((CLEAR_FIELD_DEGREES * Math.PI) / 180);

  const marginal = paraxialHeights(surfaces, pupilRadius, 0);
  // O principal passa pelo centro da pupila de entrada: y = u·(z − z_pupila).
  const chief = paraxialHeights(surfaces, -u * entrancePupil.z, u);
  const envelope = surfaces.map((_, i) => Math.abs(marginal[i]!) + Math.abs(chief[i]!));

  const result = surfaces.map((surface, i) =>
    surface.isStop ? Math.abs(marginal[i]!) : envelope[i]!,
  );

  // Até onde a esfera de cada superfície existe (com folga de 2%).
  const sphereLimit = (surface: Surface): number =>
    Number.isFinite(surface.radius) ? Math.abs(surface.radius) * 0.98 : Infinity;
  const clamp = (surface: Surface, h: number): number => Math.min(h, sphereLimit(surface));

  // Componentes: sequências de superfícies ligadas por vidro.
  let i = 0;
  while (i < surfaces.length - 1) {
    if (surfaces[i]!.material === AIR) {
      i += 1;
      continue;
    }
    let last = i + 1;
    while (last < surfaces.length - 1 && surfaces[last]!.material !== AIR) last += 1;
    const members = surfaces.slice(i, last + 1);

    const thinnestEdge = (h: number): number => {
      let edge = Infinity;
      for (let k = 0; k < members.length - 1; k += 1) {
        const front = members[k]!;
        const back = members[k + 1]!;
        const e =
          front.thickness - sag(front.radius, clamp(front, h)) + sag(back.radius, clamp(back, h));
        edge = Math.min(edge, e);
      }
      return edge;
    };

    let radius = Math.max(...envelope.slice(i, last + 1));
    if (thinnestEdge(radius) < MIN_EDGE_MM) {
      let lo = 0;
      let hi = radius;
      for (let k = 0; k < 60; k += 1) {
        const mid = (lo + hi) / 2;
        if (thinnestEdge(mid) >= MIN_EDGE_MM) lo = mid;
        else hi = mid;
      }
      radius = lo;
    }

    members.forEach((surface, k) => {
      result[i + k] = clamp(surface, radius);
    });
    i = last + 1;
  }

  return result;
}

const BAKER_STUB = {
  id: 'baker-double-gauss-50-f2',
  label: 'Gauss duplo de 6 elementos (US 2.532.751, Baker) · 50 mm f/2',
  source:
    'US 2.532.751 (J. G. Baker, Perkin-Elmer, 1950), Exemplo 1 / Fig. 1, tabela lida na ' +
    'imagem do documento; vidros SCHOTT equivalentes via refractiveindex.info (CC0 1.0). ' +
    'Ver docs/optics-sources.md §6.',
  notes:
    'Gauss duplo clássico de patente, escalado para EFL = 50 mm. Vidros trocados pelos ' +
    'equivalentes de catálogo mais próximos; posição do diafragma lida no desenho; ' +
    'diâmetros livres derivados (a patente não os dá).',
} as const;

/** Monta a prescrição: escala a tabela para 50 mm e deriva os diâmetros. */
export function designBakerDoubleGauss(): Prescription {
  // Escala: a EFL da tabela com os vidros do catálogo, levada a 50 mm.
  const unit = tableToSurfaces(1, () => 1);
  const scale = TARGET_EFL_MM / analyze({ ...BAKER_STUB, surfaces: unit }).efl;

  // Diâmetros provisórios generosos só para a análise das pupilas; os
  // definitivos saem dos raios marginal e principal.
  const provisional = tableToSurfaces(scale, () => 1e3);
  const semiDiameters = clearSemiDiameters(provisional);

  return {
    ...BAKER_STUB,
    surfaces: provisional.map((surface, index) => ({
      ...surface,
      semiDiameter: semiDiameters[index]!,
    })),
  };
}

/** A objetiva do experimento 1, resolvida uma vez. */
export const LENS_50MM_F2: Prescription = designBakerDoubleGauss();

/** Fator que leva a tabela da patente (F = 1) a 50 mm. */
export function bakerScale(): number {
  return TARGET_EFL_MM / analyze({ ...BAKER_STUB, surfaces: tableToSurfaces(1, () => 1) }).efl;
}
