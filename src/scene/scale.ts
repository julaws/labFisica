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

/**
 * Mapa de profundidade do diorama (SPEC §6.2).
 *
 *     offset(d) = k · ln(d / d_min)
 *
 * Monotônico e inversível. É o que permite representar de 30 cm a 10 m numa
 * bandeja de pouco mais de um metro de cena sem quebrar a ordem das coisas.
 *
 * A regra que faz isso valer a pena: **o plano de foco é desenhado na posição
 * mapeada da distância de foco, e cada objeto na posição mapeada da sua
 * distância física**. Então o plano corta o pinheiro na cena se e somente se a
 * física disser que o pinheiro está em foco. A compressão é forte, mas não
 * mente sobre quem está em foco.
 */
export const DIORAMA_DEPTH = {
  /** Distância física representada pela borda próxima da bandeja, mm. */
  minMm: 300,
  /** Distância física representada pela borda distante, mm. */
  maxMm: 10_000,
  /** Comprimento da bandeja em unidades de cena. */
  spanScene: 1.15,
  /** Folga entre o elemento frontal da objetiva e a borda próxima, em unidades. */
  gapScene: 0.14,
} as const;

const LOG_SPAN = Math.log(DIORAMA_DEPTH.maxMm / DIORAMA_DEPTH.minMm);

/** Unidades de cena por unidade de logaritmo natural da distância. */
export const DIORAMA_K = DIORAMA_DEPTH.spanScene / LOG_SPAN;

/**
 * Distância física (mm) → afastamento em unidades de cena, medido da objetiva
 * para o lado do objeto. Sempre crescente: mais longe na física é mais longe
 * na cena.
 */
export function distanceToDioramaOffset(millimeters: number): number {
  const clamped = Math.min(
    Math.max(millimeters, DIORAMA_DEPTH.minMm),
    DIORAMA_DEPTH.maxMm,
  );
  return DIORAMA_DEPTH.gapScene + DIORAMA_K * Math.log(clamped / DIORAMA_DEPTH.minMm);
}

/** Inverso exato de `distanceToDioramaOffset`. */
export function dioramaOffsetToDistance(offsetScene: number): number {
  const raw = (offsetScene - DIORAMA_DEPTH.gapScene) / DIORAMA_K;
  return DIORAMA_DEPTH.minMm * Math.exp(raw);
}

/** True quando a distância cabe na faixa representada pela bandeja. */
export function isWithinDiorama(millimeters: number): boolean {
  return millimeters >= DIORAMA_DEPTH.minMm && millimeters <= DIORAMA_DEPTH.maxMm;
}

/** Registro dos exageros ativos, lido pelo modal "Sobre as escalas". */
export interface ScaleDisclosure {
  readonly id: string;
  readonly label: string;
  readonly factor: number;
  readonly explanation: string;
}

export function activeScaleDisclosures(locale: 'pt-BR' | 'en' = 'pt-BR'): ScaleDisclosure[] {
  const en = locale === 'en';
  const disclosures: ScaleDisclosure[] = [];

  if (LENS_EXAGGERATION !== 1) {
    disclosures.push({
      id: 'lens',
      label: en ? 'Lens and image plane' : 'Lente e plano da imagem',
      factor: LENS_EXAGGERATION,
      explanation: en
        ? `The lens and the glass plate are drawn ${LENS_EXAGGERATION}× larger than life so the glass ` +
          'elements and the diaphragm blades are visible. It is a single factor applied to the whole ' +
          'assembly: curvatures, thicknesses and focus travel keep their correct proportions. Optical ' +
          'distances still come from the engine, in real millimetres.'
        : `A objetiva e a placa de vidro são desenhadas ${LENS_EXAGGERATION}× maiores que o ` +
          'tamanho real, para que os elementos de vidro e as lâminas do diafragma fiquem ' +
          'visíveis. É um fator único aplicado ao conjunto: as curvaturas, as espessuras e o ' +
          'curso do foco guardam as proporções corretas entre si. As distâncias ópticas ' +
          'continuam vindo do motor, em milímetros reais.',
    });
  }

  disclosures.push({
    id: 'diorama-depth',
    label: en ? 'Diorama depth' : 'Profundidade do diorama',
    factor: DIORAMA_K,
    explanation: en
      ? `From ${DIORAMA_DEPTH.minMm / 10} cm to ${DIORAMA_DEPTH.maxMm / 1000} m in a straight line would not ` +
        'fit on the bench. The diorama depth is compressed on a logarithmic scale: each time the ' +
        `distance doubles, the object moves the same amount in the scene, ${(DIORAMA_K * Math.LN2 * 100).toFixed(1)} cm. ` +
        'The compression keeps the order and, what really matters, keeps who is in focus: the focus plane ' +
        'is drawn through the same map, so it cuts an object in the scene exactly when physics says that ' +
        'object is sharp.'
      : `De ${DIORAMA_DEPTH.minMm / 10} cm a ${DIORAMA_DEPTH.maxMm / 1000} m em linha reta não ` +
      'caberia na bancada. A profundidade do diorama é comprimida em escala ' +
      'logarítmica: cada vez que a distância dobra, o objeto anda a mesma coisa na cena, ' +
      `${(DIORAMA_K * Math.LN2 * 100).toFixed(1)} cm. A compressão preserva a ordem e, o que ` +
      'importa de verdade, preserva quem está em foco: o plano de foco é desenhado pelo ' +
      'mesmo mapa, então ele corta um objeto na cena exatamente quando a física diz que ' +
      'aquele objeto está nítido.',
  });

  return disclosures;
}
