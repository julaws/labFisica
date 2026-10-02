import type { ExperimentCopy, Locale } from '../../core/experiment';
import type { LensId } from '../../optics/lenses';
import { activeScaleDisclosures } from '../../scene/scale';
import {
  formatCentimeters,
  formatDistance,
  formatFNumber,
  formatMillimeters,
  formatNumber,
} from '../../ui/i18n';

/**
 * Textos do experimento (SPEC §6.7), em pt-BR e inglês.
 *
 * As seções do modal são **funções dos fatos atuais**: todo número que
 * aparece aqui chega calculado pelo motor óptico no objeto `Facts`. Nenhuma
 * frase tem número digitado — se o foco mudar, o texto muda junto.
 */

export interface Facts {
  /** Objetiva montada (ADR 0007). */
  readonly lens: LensId;
  /** True quando a objetiva forma imagem real. */
  readonly converging: boolean;
  /** Borrão de aberração esférica no melhor foco, mm. */
  readonly aberrationSpot: number;
  /** Disco do pinheiro no sensor parado (vale também para a divergente), mm. */
  readonly plateBlurPine: number;
  readonly focalLength: number;
  readonly fNumber: number;
  readonly widestFNumber: number;
  readonly focusDistance: number;
  readonly dofTotal: number;
  readonly dofNear: number;
  readonly dofFar: number;
  readonly coc: number;
  readonly extension: number;
  readonly pupilDiameter: number;
  readonly blurPine: number;
  readonly blurCabin: number;
  readonly blurPeak: number;
  readonly eflPrescription: number;
  readonly lensExaggeration: number;
}

const cm = formatCentimeters;
const mm = formatMillimeters;

export function buildCopy(facts: Facts): ExperimentCopy {
  const pt = (locale: Locale): Record<string, string> => sectionsFor(facts, locale);
  const ptTexts = pt('pt-BR');
  const enTexts = pt('en');

  const section = (id: string, headingPt: string, headingEn: string) => ({
    id,
    heading: { 'pt-BR': headingPt, en: headingEn },
    body: { 'pt-BR': ptTexts[id]!, en: enTexts[id]! },
  });

  return {
    title: { 'pt-BR': 'O plano de foco', en: 'The plane of focus' },
    subtitle: {
      'pt-BR':
        'Todo mundo percebe quando uma foto sai tremida. Quase ninguém viu o plano exato onde ela fica nítida. Gire o anel de foco e veja o plano se mover.',
      en: 'Everyone notices a blurry photo. Almost nobody has seen the exact plane where it comes into focus. Turn the focus ring and watch the plane move.',
    },
    sections: [
      section('sharp', 'Onde a foto fica nítida', 'Where the photo is sharp'),
      section('blur', 'Por que o resto desfoca', 'Why the rest blurs'),
      section('ring', 'O anel de foco', 'The focus ring'),
      section('aperture', 'A abertura', 'The aperture'),
      section('upside-down', 'De cabeça para baixo?', 'Upside down?'),
      section('scales', 'Sobre as escalas', 'About the scales'),
      section('swap', 'Trocar a objetiva', 'Swapping the objective'),
      section('lens', 'Que lente é esta', 'Which lens is this'),
    ],
  };
}

/** Descrição de cada objetiva, com os números do motor. */
function lensText(facts: Facts, locale: Locale): string {
  const n = (value: number, decimals: number): string => formatNumber(value, decimals, locale);
  const f = n(Math.abs(facts.eflPrescription), 1);
  if (locale === 'en') {
    switch (facts.lens) {
      case 'biconvex':
        return (
          `A single symmetric biconvex lens of N-BK7, +${f} mm, designed here: the radius is solved so the ` +
          `thick lens has exactly that focal length. It corrects nothing — no second element to cancel the ` +
          `aberrations — which is exactly what the comparison with the double Gauss shows.`
        );
      case 'biconcave':
        return (
          `A single symmetric biconcave lens of N-BK7, −${f} mm, designed the same way. Its focal length is ` +
          `negative: it spreads light instead of gathering it, and on its own it never forms a real image.`
        );
      default:
        return (
          `A six-element double Gauss of ${f} mm f/2, from US patent 2,532,751 ` +
          `(James G. Baker, 1950), scaled to 50 mm. The patent's glasses were swapped for the closest ones in ` +
          `today's SCHOTT catalogue. The patent gives neither the clear diameters nor the stop position: the ` +
          `diameters are derived here from the f/2 marginal ray and the 10° chief ray, and the stop sits where the ` +
          `patent drawing puts it, in the middle of the central air space.`
        );
    }
  }
  switch (facts.lens) {
    case 'biconvex':
      return (
        `Uma lente biconvexa simples e simétrica de N-BK7, +${f} mm, projetada aqui: o raio é resolvido para ` +
        `a lente espessa ter exatamente essa distância focal. Ela não corrige nada — não há um segundo ` +
        `elemento para cancelar as aberrações —, e é isso que a comparação com o Gauss duplo mostra.`
      );
    case 'biconcave':
      return (
        `Uma lente bicôncava simples e simétrica de N-BK7, −${f} mm, projetada do mesmo jeito. A distância ` +
        `focal é negativa: ela espalha a luz em vez de juntar, e sozinha nunca forma imagem real.`
      );
    default:
      return (
        `Um Gauss duplo de seis elementos, ${f} mm f/2, da patente americana ` +
        `2.532.751 (James G. Baker, 1950), escalado para 50 mm. Os vidros da patente foram trocados pelos mais ` +
        `próximos do catálogo SCHOTT atual. A patente não dá os diâmetros nem a posição do diafragma: os ` +
        `diâmetros são derivados aqui do raio marginal em f/2 e do raio principal a 10°, e o diafragma fica onde o ` +
        `desenho da patente o põe, no meio do espaço de ar central.`
      );
  }
}

/** Seção "Trocar a objetiva": o que muda de uma lente para outra. */
function swapText(facts: Facts, locale: Locale): string {
  const spot = mm(facts.aberrationSpot, locale);
  const coc = mm(facts.coc, locale);
  const fN = formatFNumber(facts.fNumber, locale);
  const pine = mm(facts.plateBlurPine, locale);
  if (locale === 'en') {
    const now =
      facts.lens === 'biconcave'
        ? `With the diverging lens mounted, the pine reaches the glass as a ${pine} disc — wider than the whole ` +
          `36 mm sensor. The rays leave the lens spreading out, as if they came from a point in front of it: the ` +
          `virtual image, drawn faint. The focus ring still moves the lens, by the same travel as a 50 mm, but no ` +
          `position brings anything to a point.`
        : `With this lens at ${fN}, spherical aberration alone spreads a perfectly focused point into a ${spot} ` +
          `disc${facts.aberrationSpot > facts.coc ? `, more than the ${coc} acceptable circle: nothing is truly sharp until you stop down.` : `, below the ${coc} acceptable circle.`}`;
    return (
      `The double Gauss and the simple converging lens have the same +50 mm focal length, so focus, sharp zone ` +
      `and circles of confusion are the same. What changes is aberration: a single lens bends the rays at the ` +
      `edge of the pupil too much, they meet short of the rest, and a point becomes a small disc even in focus. ` +
      `The six elements of the double Gauss cancel most of that.

` +
      `The diverging lens has a −50 mm focal length. It forms no real image anywhere: whatever you turn, the ` +
      `ground glass only receives spread light.

${now}`
    );
  }
  const now =
    facts.lens === 'biconcave'
      ? `Com a divergente montada, o pinheiro chega ao vidro como um disco de ${pine} — mais largo que o sensor ` +
        `inteiro, de 36 mm. Os raios saem da lente abrindo, como se viessem de um ponto à frente dela: a imagem ` +
        `virtual, desenhada apagada. O anel de foco continua movendo a lente, pelo mesmo curso de uma 50 mm, mas ` +
        `nenhuma posição leva nada a um ponto.`
      : `Com esta lente em ${fN}, só a aberração esférica já espalha um ponto perfeitamente focado num disco de ` +
        `${spot}${facts.aberrationSpot > facts.coc ? `, maior que o círculo admissível de ${coc}: nada fica realmente nítido até fechar o diafragma.` : `, menor que o círculo admissível de ${coc}.`}`;
  return (
    `O Gauss duplo e a lente convergente simples têm a mesma distância focal, +50 mm: o foco, a zona nítida e ` +
    `os círculos de confusão são os mesmos. O que muda é a aberração: uma lente simples desvia demais os raios ` +
    `da borda da pupila, eles se encontram antes dos outros, e um ponto vira um pequeno disco mesmo focado. Os ` +
    `seis elementos do Gauss duplo cancelam quase tudo isso.\n\n` +
    `A lente divergente tem distância focal de −50 mm. Ela não forma imagem real em lugar nenhum: gire o que ` +
    `girar, o vidro fosco só recebe luz espalhada.\n\n${now}`
  );
}

function sectionsFor(facts: Facts, locale: Locale): Record<string, string> {
  const n = (value: number, decimals: number): string => formatNumber(value, decimals, locale);
  const focus = formatDistance(facts.focusDistance, locale);
  const fN = formatFNumber(facts.fNumber, locale);
  // Duas casas: é o número do ADR 0003, e arredondar para f/1,8 esconderia
  // justamente a diferença que o texto explica.
  // Arredondado ao centésimo: f/2, não f/2,00 nem f/1,9999999.
  const widest = formatFNumber(Math.round(facts.widestFNumber * 100) / 100, locale);
  // Um disco abaixo de um micrômetro é, para todos os efeitos, um ponto.
  const disc = (value: number): string =>
    value < 0.001 ? (locale === 'en' ? 'a point' : 'um ponto') : mm(value, locale);
  const zone = Number.isFinite(facts.dofTotal) ? cm(facts.dofTotal, locale) : '∞';
  const near = formatDistance(facts.dofNear, locale);
  const far = formatDistance(facts.dofFar, locale);

  const disclosures = activeScaleDisclosures(locale);

  if (locale === 'en') {
    return {
      sharp:
        `A lens brings exactly one distance to a perfect point. Right now that distance is ${focus}; ` +
        `every point at that distance forms a plane — the plane of focus, the cyan sheet in the valley.\n\n` +
        `Around it there is a tolerable band, the sharp zone: ${zone}, from ${near} to ${far}. ` +
        `Anything inside it lands on the sensor as a disc smaller than ${mm(facts.coc, locale)}, ` +
        `which the eye cannot tell from a point.`,
      blur:
        `A point off the plane sends a cone of light that closes before or after the glass. ` +
        `The sensor cuts the cone and records a disc: the circle of confusion.\n\n` +
        `With the current focus the pine becomes ${disc(facts.blurPine) === 'a point' ? 'a point' : `a ${disc(facts.blurPine)} disc`}, ` +
        `the cabin ${disc(facts.blurCabin)} and the peak ${disc(facts.blurPeak)}. ` +
        `The rings drawn on the ground glass have exactly these diameters.`,
      ring:
        `Turning the ring moves the whole glass group away from the sensor. To focus at ${focus} the lens ` +
        `travels ${mm(facts.extension, locale)} beyond its ${n(facts.focalLength, 0)} mm focal length.\n\n` +
        `The distance scale engraved on the ring uses the same map as the engine: the mark you read is the real distance.`,
      aperture:
        `The nine-blade diaphragm sets the pupil diameter, D = f/N. At ${fN}, D = ${mm(facts.pupilDiameter, locale)}. ` +
        `Closing one full stop halves the area and shrinks every disc in the same proportion; the sharp zone grows.\n\n` +
        `This lens opens up to ${widest}. f/1.4 would need larger glass.`,
      'upside-down':
        `Rays from the top of an object cross the axis at the lens and reach the bottom of the sensor. ` +
        `Every image formed by a converging lens is inverted — your eye's included.\n\n` +
        `A camera turns the picture right side up in software. The ground glass shows it the way light actually leaves it.`,
      scales:
        disclosures.map((d) => `${d.label}. ${d.explanation}`).join('\n\n') +
        `\n\nThe rays on the object side live in the compressed space of the diorama; on the image side they live in ` +
        `the enlarged scale of the lens. The chief-ray angle is the scene's, not the physical one. The point where ` +
        `each cone closes, and the width of the cone at the glass, are not exaggerated at all.\n\n` +
        `The thin line where the focus plane cuts the valley has a fixed width so it stays visible; the wide band ` +
        `around it is the real sharp zone.`,
      swap: swapText(facts, locale),
      lens: lensText(facts, locale),
    };
  }

  return {
    sharp:
      `Uma lente leva uma única distância a um ponto perfeito. Agora essa distância é ${focus}; ` +
      `todos os pontos a essa distância formam um plano — o plano de foco, a lâmina ciano no vale.\n\n` +
      `Em volta dele existe uma faixa tolerável, a zona nítida: ${zone}, de ${near} a ${far}. ` +
      `O que estiver dentro dela chega ao sensor como um disco menor que ${mm(facts.coc, locale)}, ` +
      `que o olho não distingue de um ponto.`,
    blur:
      `Um ponto fora do plano manda um cone de luz que se fecha antes ou depois do vidro. ` +
      `O sensor corta o cone e registra um disco: o círculo de confusão.\n\n` +
      `Com o foco atual, o pinheiro vira ${disc(facts.blurPine) === 'um ponto' ? 'um ponto' : `um disco de ${disc(facts.blurPine)}`}, ` +
      `a cabana ${disc(facts.blurCabin)} e o pico ${disc(facts.blurPeak)}. ` +
      `Os anéis desenhados no vidro fosco têm exatamente esses diâmetros.`,
    ring:
      `Girar o anel afasta o conjunto de vidros do sensor. Para focar em ${focus}, a lente anda ` +
      `${mm(facts.extension, locale)} além da distância focal de ${n(facts.focalLength, 0)} mm.\n\n` +
      `A escala gravada no anel usa o mesmo mapa que o motor: a marca que você lê é a distância real.`,
    aperture:
      `O diafragma de nove lâminas define o diâmetro da pupila, D = f/N. Em ${fN}, D = ${mm(facts.pupilDiameter, locale)}. ` +
      `Fechar um stop completo corta a área pela metade e encolhe todos os discos na mesma proporção; a zona nítida cresce.\n\n` +
      `Esta objetiva abre até ${widest}. f/1,4 exigiria vidro maior.`,
    'upside-down':
      `Os raios do alto de um objeto cruzam o eixo na lente e chegam embaixo no sensor. ` +
      `Toda imagem formada por uma lente convergente é invertida — a do seu olho também.\n\n` +
      `A câmera desvira a imagem por software. O vidro fosco mostra como a luz de fato a deposita ali.`,
    scales:
      disclosures.map((d) => `${d.label}. ${d.explanation}`).join('\n\n') +
      `\n\nDo lado do objeto os raios vivem no espaço comprimido do diorama; do lado da imagem, na escala ` +
      `ampliada da lente. O ângulo do raio principal é o da cena, não o da física. Já o ponto onde cada cone se ` +
      `fecha, e a largura do cone no vidro, não têm exagero nenhum.\n\n` +
      `A linha fina onde o plano de foco corta o vale tem largura fixa, para continuar visível; a faixa larga em ` +
      `volta dela é a zona nítida real.`,
    swap: swapText(facts, locale),
    lens: lensText(facts, locale),
  };
}

/** Atalhos do experimento, listados no modal (SPEC §2). */
export const SHORTCUTS = [
  { keys: '1 2 3', description: { 'pt-BR': 'foco em primeiro plano, meio e fundo', en: 'focus foreground, middle, background' } },
  { keys: '[ ]', description: { 'pt-BR': 'ajuste fino do foco', en: 'fine focus' } },
  { keys: 'F', description: { 'pt-BR': 'próxima abertura', en: 'next aperture' } },
  { keys: 'X', description: { 'pt-BR': 'lente montada ou explodida', en: 'assembled or exploded lens' } },
  { keys: 'L', description: { 'pt-BR': 'trocar a objetiva', en: 'swap the objective' } },
  { keys: 'C', description: { 'pt-BR': 'câmeras cinematográficas', en: 'cinematic cameras' } },
  { keys: 'R', description: { 'pt-BR': 'resetar a vista', en: 'reset view' } },
  { keys: '/', description: { 'pt-BR': 'esconder a interface', en: 'hide the interface' } },
  { keys: 'W A S D', description: { 'pt-BR': 'mover a câmera', en: 'move the camera' } },
  { keys: 'Q E', description: { 'pt-BR': 'girar a câmera', en: 'turn the camera' } },
  { keys: '?', description: { 'pt-BR': 'esta ajuda', en: 'this help' } },
] as const;
