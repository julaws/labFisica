import { AIR, GLASSES, type Glass, abbeNumber, indexD } from '../glass';
import { WAVELENGTHS_NM } from '../constants';
import type { Prescription, Surface } from '../prescription';
import { analyze } from '../paraxial';
import { axialCrossing, collimatedRay, traceRay } from '../trace';

/**
 * Objetiva do experimento 1: **par simétrico de dubletos acromáticos
 * cimentados em torno do stop**, 50 mm f/2.
 *
 * ## Por que não é um Gauss duplo de patente
 *
 * A SPEC §5.3 pede uma prescrição de Gauss duplo de fonte pública documentada e
 * proíbe inventar números (§13). A busca por uma tabela que pudesse ser citada
 * com segurança não deu resultado utilizável: o OCR das patentes antigas no
 * Google Patents sai corrompido (índices impossíveis como n = 1,010 e sinais de
 * raio perdidos) e as transcrições organizadas que existem são de bases com
 * direitos reservados. A própria SPEC prevê a saída: *"Se não houver fonte
 * confiável, usar dois dubletos acromáticos simétricos em torno do stop e
 * documentar isso."* É o que este módulo faz.
 *
 * ## O que é derivado e o que é escolha de projeto
 *
 * Nada aqui é constante solta. Os **dados físicos** (índices e dispersão) vêm do
 * catálogo CC0 do refractiveindex.info via `../glass`. A **geometria** é
 * resolvida aqui, por estas equações:
 *
 * 1. Condição acromática de duas lentes finas em contato:
 *    `Φ_a/V_a + Φ_b/V_b = 0`, que dá
 *    `f_a = f_d·(V_a − V_b)/V_a` e `f_b = −f_d·(V_a − V_b)/V_b`.
 * 2. Equação do fabricante de lentes para cada superfície do dubleto cimentado,
 *    com `R1` livre (o "bending", parâmetro de forma).
 * 3. `f_d` é resolvido por bissecção até a **EFL paraxial do sistema espesso**
 *    dar exatamente 50 mm.
 * 4. `κ` corrige a potência do flint até a **aberração cromática longitudinal
 *    medida no traçador real** (linhas F e C) zerar. A condição do passo 1 é de
 *    lente fina; κ absorve o efeito das espessuras.
 *
 * O único número escolhido à mão é o bending `R1 / f_d = 1,30`, achado por
 * varredura minimizando a aberração esférica marginal em f/2. A varredura está
 * reproduzida no teste `tests/optics/prescription.test.ts`, que falha se 1,30
 * deixar de ser o mínimo.
 *
 * ## Limitação declarada
 *
 * Com 4 elementos a aberração esférica residual em f/2 é da ordem de −1,9 mm,
 * bem maior que a de uma objetiva comercial de 6 elementos. Isso é honesto e
 * até didático (o modo "Aberrações" mostra o efeito com clareza), mas precisa
 * estar dito na interface: esta é uma lente de laboratório, não uma cópia de
 * objetiva de mercado. Ver `docs/optics-sources.md` e o modal "?" da F7.
 */

export interface DoubletDesignOptions {
  /** Vidro crown do dubleto (o elemento positivo). */
  readonly crown: Glass;
  /** Vidro flint do dubleto (o elemento negativo, que corrige a cor). */
  readonly flint: Glass;
  /** Distância focal alvo do sistema completo, mm. */
  readonly targetEfl: number;
  /** Parâmetro de forma: R1 / f_dubleto. */
  readonly bending: number;
  /** Espessura central do crown, mm. */
  readonly crownThickness: number;
  /** Espessura central do flint, mm. */
  readonly flintThickness: number;
  /** Separação total entre os dois dubletos, com o stop no meio, mm. */
  readonly airGap: number;
  /** Semidiâmetro livre dos elementos de vidro, mm. */
  readonly semiDiameter: number;
  /** Semidiâmetro do stop totalmente aberto, mm. */
  readonly stopSemiDiameter: number;
}

export const DEFAULT_DESIGN: DoubletDesignOptions = {
  crown: GLASSES['N-LAK22'],
  flint: GLASSES['N-SF5'],
  targetEfl: 50,
  bending: 1.3,
  crownThickness: 7,
  flintThickness: 2.6,
  airGap: 18,
  semiDiameter: 15,
  stopSemiDiameter: 12.5,
};

/** Monta a prescrição para um dado `f_d` e fator `κ` do flint. */
function build(options: DoubletDesignOptions, doubletFocal: number, kappa: number): Prescription {
  const { crown, flint } = options;
  const va = abbeNumber(crown);
  const vb = abbeNumber(flint);
  const na = indexD(crown);
  const nb = indexD(flint);

  // Condição acromática de lentes finas em contato.
  const fa = (doubletFocal * (va - vb)) / va;
  const fb = (-doubletFocal * (va - vb)) / vb / kappa;

  // Equação do fabricante de lentes, com R1 livre.
  const r1 = options.bending * doubletFocal;
  const curvature2 = 1 / r1 - 1 / (fa * (na - 1));
  const r2 = 1 / curvature2;
  const curvature3 = curvature2 - 1 / (fb * (nb - 1));
  const r3 = 1 / curvature3;

  const { crownThickness: tc, flintThickness: tf, airGap, semiDiameter: sd } = options;
  const surfaces: Surface[] = [
    { radius: r1, thickness: tc, material: crown, semiDiameter: sd, isStop: false },
    { radius: r2, thickness: tf, material: flint, semiDiameter: sd, isStop: false },
    { radius: r3, thickness: airGap / 2, material: AIR, semiDiameter: sd, isStop: false },
    {
      radius: Infinity,
      thickness: airGap / 2,
      material: AIR,
      semiDiameter: options.stopSemiDiameter,
      isStop: true,
    },
    { radius: -r3, thickness: tf, material: flint, semiDiameter: sd, isStop: false },
    { radius: -r2, thickness: tc, material: crown, semiDiameter: sd, isStop: false },
    { radius: -r1, thickness: 0, material: AIR, semiDiameter: sd, isStop: false },
  ];

  return {
    id: 'symmetric-double-doublet-50-f2',
    label: 'Par simétrico de dubletos acromáticos · 50 mm f/2',
    surfaces,
    source:
      'Geometria derivada neste módulo a partir da condição acromática e da equação do ' +
      'fabricante de lentes; índices e dispersão dos vidros SCHOTT via refractiveindex.info (CC0 1.0). ' +
      'Ver docs/optics-sources.md.',
    notes:
      'Alternativa prevista pela SPEC §5.3 para a ausência de uma prescrição de Gauss duplo ' +
      'de fonte citável. Não é cópia de nenhuma objetiva comercial.',
  };
}

/** Aberração cromática longitudinal medida no traçador real, mm. */
function longitudinalChromaticAberration(prescription: Prescription, height = 0.02): number {
  const focusAt = (wavelengthNm: number): number => {
    const result = traceRay(prescription, collimatedRay(height), wavelengthNm);
    if (!result.exit) return Number.NaN;
    return axialCrossing(result.exit);
  };
  return focusAt(WAVELENGTHS_NM.F) - focusAt(WAVELENGTHS_NM.C);
}

/** Bissecção genérica sobre uma função monotônica. */
function bisect(f: (x: number) => number, lo: number, hi: number, iterations = 100): number {
  let a = lo;
  let b = hi;
  const fa = f(a);

  for (let i = 0; i < iterations; i += 1) {
    const mid = (a + b) / 2;
    if (fa * f(mid) <= 0) b = mid;
    else a = mid;
  }

  return (a + b) / 2;
}

/**
 * Resolve o projeto: acha `f_d` que dá a EFL alvo e `κ` que anula a aberração
 * cromática longitudinal, e devolve a prescrição resultante.
 */
export function designSymmetricDoubleDoublet(
  options: DoubletDesignOptions = DEFAULT_DESIGN,
): Prescription {
  const eflFor = (doubletFocal: number, kappa: number): number =>
    analyze(build(options, doubletFocal, kappa)).efl;

  const solveDoubletFocal = (kappa: number): number =>
    bisect((fd) => eflFor(fd, kappa) - options.targetEfl, 30, 500);

  const kappa = bisect(
    (k) => longitudinalChromaticAberration(build(options, solveDoubletFocal(k), k)),
    0.7,
    1.4,
    60,
  );

  return build(options, solveDoubletFocal(kappa), kappa);
}

/**
 * O par de dubletos resolvido uma vez. Foi a objetiva do experimento 1 até a
 * chegada do Gauss duplo da patente US 2.532.751 (ADR 0005); fica como
 * referência e é coberto pelos testes do motor.
 */
export const SYMMETRIC_DOUBLE_DOUBLET: Prescription = designSymmetricDoubleDoublet();

