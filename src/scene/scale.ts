/**
 * Conversões entre a física (milímetros, SPEC §5) e a cena 3D (SPEC §6.2).
 *
 * A unidade da cena é o **metro**: é o que deixa as luzes de área, o alcance
 * das sombras e os controles de câmera com números naturais.
 *
 * Este é o **único** lugar do projeto onde um exagero de escala pode existir.
 * Todo fator declarado aqui aparece no item "Sobre as escalas" do modal "?"
 * (SPEC §6.2), que lê estas constantes em vez de repetir números à mão.
 *
 * O mapa logarítmico de profundidade do diorama entra na F4; por ora só existe
 * a conversão de unidades, que não distorce nada.
 */

/** 1 mm de física = 0,001 unidade de cena. */
export const SCENE_UNITS_PER_MM = 0.001;

export const mmToScene = (mm: number): number => mm * SCENE_UNITS_PER_MM;
export const sceneToMm = (units: number): number => units / SCENE_UNITS_PER_MM;

/**
 * Fator de ampliação da lente e do plano da imagem (SPEC §6.2).
 *
 * Uma objetiva de 50 mm tem cerca de 3 cm de diâmetro. Na bancada, do outro
 * lado da sala, o vidro sumiria e o diafragma seria invisível. A objetiva é
 * desenhada **6× maior** que o tamanho real.
 *
 * O que NÃO muda com isso: as curvaturas, as espessuras e o curso de foco
 * mantêm as proporções corretas entre si, porque a ampliação é um fator único
 * aplicado ao conjunto. Nenhuma distância óptica é calculada nesta escala — o
 * motor continua em milímetros reais.
 */
export const LENS_EXAGGERATION: number = 6;

/** Registro dos exageros ativos, lido pelo modal "Sobre as escalas". */
export interface ScaleDisclosure {
  readonly id: string;
  readonly label: string;
  readonly factor: number;
  readonly explanation: string;
}

export function activeScaleDisclosures(): ScaleDisclosure[] {
  const disclosures: ScaleDisclosure[] = [];

  if (LENS_EXAGGERATION !== 1) {
    disclosures.push({
      id: 'lens',
      label: 'Lente e plano da imagem',
      factor: LENS_EXAGGERATION,
      explanation:
        `A objetiva e a placa de vidro são desenhadas ${LENS_EXAGGERATION}× maiores que o ` +
        'tamanho real, para que os elementos de vidro e as lâminas do diafragma fiquem ' +
        'visíveis. É um fator único aplicado ao conjunto: as curvaturas, as espessuras e o ' +
        'curso do foco guardam as proporções corretas entre si. As distâncias ópticas ' +
        'continuam vindo do motor, em milímetros reais.',
    });
  }

  return disclosures;
}
