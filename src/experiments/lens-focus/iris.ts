import { clamp } from '../../optics/units';

/**
 * Geometria do diafragma de 9 lâminas (SPEC §6.4).
 *
 * Cada lâmina é modelada como um disco de raio `bladeRadius` cujo centro fica a
 * uma distância `pivotRadius` do eixo, deslocado de `armLength` e girado de um
 * ângulo ψ em torno do pivô. A união dos nove discos deixa um furo de nove
 * lados; a borda visível de cada lâmina é o arco do seu disco.
 *
 * O raio livre é então exatamente:
 *
 *     r(ψ) = √(p² + d² + 2·p·d·cos ψ) − a
 *
 * que é **inversível em forma fechada**. Isso importa: a abertura desenhada não
 * é "o que pareceu certo", é a que corresponde ao semidiâmetro do stop que o
 * motor óptico calcula para cada f/N (CLAUDE.md §3).
 */

export interface IrisConfig {
  readonly bladeCount: number;
  /** Distância do pivô da lâmina ao eixo óptico, mm. */
  readonly pivotRadius: number;
  /** Distância do pivô ao centro do disco da lâmina, mm. */
  readonly armLength: number;
  /** Raio do disco da lâmina, mm. */
  readonly bladeRadius: number;
}

/**
 * Dimensões escolhidas para que a íris cubra toda a faixa útil desta objetiva:
 * abre até 14 mm de raio livre (mais que os 12,5 mm do stop totalmente aberto)
 * e fecha até zero. O alcance externo das lâminas recolhidas, 34 mm, é o que
 * define o diâmetro mínimo do barril — numa objetiva real é a mesma conta.
 */
export const DEFAULT_IRIS: IrisConfig = {
  bladeCount: 9,
  pivotRadius: 17,
  armLength: 7,
  bladeRadius: 10,
};

/** Raio externo alcançado pelas lâminas recolhidas, mm. Dimensiona o barril. */
export function bladeSweepRadius(config: IrisConfig): number {
  return config.pivotRadius + config.armLength + config.bladeRadius;
}

/** Raio livre da abertura para um ângulo de lâmina, mm. */
export function apertureRadiusForAngle(config: IrisConfig, psi: number): number {
  const { pivotRadius: p, armLength: d, bladeRadius: a } = config;
  const distance = Math.sqrt(p * p + d * d + 2 * p * d * Math.cos(psi));
  return distance - a;
}

/** Maior abertura que a íris alcança (lâminas totalmente recolhidas), mm. */
export function maxApertureRadius(config: IrisConfig): number {
  return apertureRadiusForAngle(config, 0);
}

/** Menor abertura, mm. Pode ser negativa, o que significa íris fechada. */
export function minApertureRadius(config: IrisConfig): number {
  return apertureRadiusForAngle(config, Math.PI);
}

/**
 * Ângulo de lâmina que produz o raio livre pedido. Inverso exato de
 * `apertureRadiusForAngle`, limitado à faixa mecânica da íris.
 */
export function bladeAngleForAperture(config: IrisConfig, targetRadius: number): number {
  const { pivotRadius: p, armLength: d, bladeRadius: a } = config;
  const wanted = targetRadius + a;
  const cosine = (wanted * wanted - p * p - d * d) / (2 * p * d);
  return Math.acos(clamp(cosine, -1, 1));
}

export interface BladePlacement {
  /** Distância do centro do disco da lâmina ao eixo óptico, mm. */
  readonly centerRadius: number;
  /** Ângulo polar do centro do disco, em radianos. */
  readonly centerAngle: number;
}

/** Posição do disco de cada lâmina para um dado ângulo ψ. */
export function bladePlacements(config: IrisConfig, psi: number): BladePlacement[] {
  const { bladeCount, pivotRadius: p, armLength: d } = config;

  const radial = p + d * Math.cos(psi);
  const tangential = d * Math.sin(psi);
  const centerRadius = Math.hypot(radial, tangential);
  const offsetAngle = Math.atan2(tangential, radial);

  const placements: BladePlacement[] = [];
  for (let i = 0; i < bladeCount; i += 1) {
    placements.push({
      centerRadius,
      centerAngle: (i / bladeCount) * Math.PI * 2 + offsetAngle,
    });
  }

  return placements;
}

/**
 * Área geométrica do polígono livre deixado pelas lâminas, mm².
 * Usada nos testes para confirmar que fechar um stop reduz a área pela metade.
 */
export function apertureArea(config: IrisConfig, psi: number): number {
  const radius = Math.max(0, apertureRadiusForAngle(config, psi));
  const n = config.bladeCount;
  // Polígono regular de n lados inscrito entre os arcos, com apótema = raio livre.
  return n * radius * radius * Math.tan(Math.PI / n);
}
