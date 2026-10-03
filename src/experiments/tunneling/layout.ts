/**
 * Geometria da bancada do tunelamento (ADR 0011), no referencial do grupo do
 * experimento: origem na face esquerda da barreira, no nível de 0 eV; x ao
 * longo do feixe, y para cima, z para a frente da bancada.
 *
 * **Altura é energia**, como no diagrama de energia dos livros: o feixe corre
 * na altura da energia do elétron, e a barreira é um muro da altura V₀. Um
 * elétron clássico, uma bolinha rolando mais baixo que o muro, nunca passaria.
 *
 * **A horizontal é ampliada**: 1 nm vira 0,4 m. A barreira real tem frações
 * de nanômetro.
 */

/** Metros de cena por elétron-volt (vertical). */
export const SCENE_PER_EV = 0.12;
/** Metros de cena por nanômetro (horizontal). */
export const SCENE_PER_NM = 0.4;
/** Altura do nível de 0 eV acima do tampo da bancada, m. */
export const BASE_ABOVE_TOP = 0.1;
/** Posição da face esquerda da barreira na bancada, m. */
export const BARRIER_X = 0.05;
/** Ponta do canhão e boca do coletor, no referencial do grupo, m. */
export const NOZZLE_X = -1.0;
export const COLLECTOR_X = 1.08;
/** Trecho em que a onda é desenhada, m. */
export const WAVE_FROM = -0.98;
export const WAVE_TO = 1.0;
/** Profundidade do muro (z), m. */
export const BARRIER_DEPTH = 0.34;
/** Altura do desenho da onda por unidade de amplitude, m. */
export const WAVE_HEIGHT = 0.07;
