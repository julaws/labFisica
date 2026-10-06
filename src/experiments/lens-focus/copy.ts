import type { ExperimentCopy, Locale } from '../../core/experiment';
import type { LensId } from '../../optics/lenses';
import { activeScaleDisclosures } from '../../scene/scale';
import { formatCentimeters, formatDistance, formatMillimeters, formatNumber } from '../../ui/i18n';

/**
 * Textos do experimento (SPEC §6.7), em pt-BR e inglês.
 *
 * O modal "?" fala com estudantes do 9º ano e do 1º ano do ensino médio: tom
 * leve, conceitos no lugar de equações e variáveis. As seções continuam sendo
 * **funções dos fatos atuais**: todo número que aparece aqui chega calculado
 * pelo motor óptico no objeto `Facts`. Se o foco mudar, o texto muda junto.
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
    shortcuts: SHORTCUTS,
    sections: [
      section('sharp', 'Onde a foto fica nítida', 'Where the photo is sharp'),
      section('blur', 'Por que o resto borra', 'Why the rest blurs'),
      section('ring', 'O anel de foco', 'The focus ring'),
      section('aperture', 'A abertura: a pupila da câmera', "The aperture: the camera's pupil"),
      section('upside-down', 'De ponta-cabeça?', 'Upside down?'),
      section('swap', 'Três lentes, três personalidades', 'Three lenses, three personalities'),
      section('lens', 'Que lente é esta?', 'Which lens is this?'),
      section('scales', 'Sobre os tamanhos', 'About the sizes'),
    ],
  };
}

/** Descrição de cada objetiva, em linguagem simples, com os números do motor. */
function lensText(facts: Facts, locale: Locale): string {
  const f = formatNumber(Math.abs(facts.eflPrescription), 0, locale);
  if (locale === 'en') {
    switch (facts.lens) {
      case 'biconvex':
        return (
          `A simple converging lens: a single piece of glass, thicker in the middle than at the edges. It is the ` +
          `kind of lens in magnifying glasses and reading glasses. It gathers light just like the double Gauss, ` +
          `but it has no "teammates" to fix its little flaws.`
        );
      case 'biconcave':
        return (
          `A diverging lens: a piece of glass thinner in the middle than at the edges. It is the kind of lens in ` +
          `glasses for short-sighted people. It spreads light out, so on its own it never projects an image.`
        );
      default:
        return (
          `A ${f} mm double Gauss, the classic design of the "normal" lenses on cameras. This one follows a 1950 ` +
          `patent by James G. Baker. Its six glasses sit almost like a mirror image around the diaphragm, and that ` +
          `symmetry makes the flaws on one side cancel the flaws on the other. That is why the recipe has been ` +
          `used for more than a century!`
        );
    }
  }
  switch (facts.lens) {
    case 'biconvex':
      return (
        `Uma lente convergente simples: um vidro só, mais grosso no meio que nas bordas. É o tipo de lente das ` +
        `lupas e dos óculos de leitura. Ela junta a luz igualzinho ao Gauss duplo, mas não tem "colegas de ` +
        `equipe" para corrigir os seus pequenos defeitos.`
      );
    case 'biconcave':
      return (
        `Uma lente divergente: um vidro mais fino no meio que nas bordas. É o tipo de lente dos óculos de quem ` +
        `tem miopia. Ela espalha a luz e, por isso, sozinha, nunca projeta uma imagem.`
      );
    default:
      return (
        `Um Gauss duplo de ${f} mm, o desenho clássico das objetivas "normais" das câmeras. Este segue uma ` +
        `patente de 1950, de James G. Baker. Os seis vidros ficam quase espelhados em volta do diafragma, e essa ` +
        `simetria faz os defeitos de um lado se cancelarem com os do outro. Por isso essa receita é usada há ` +
        `mais de um século!`
      );
  }
}

/** Seção "Três lentes": o que muda de uma lente para outra. */
function swapText(facts: Facts, locale: Locale): string[] {
  const spot = mm(facts.aberrationSpot, locale);
  const pine = mm(facts.plateBlurPine, locale);
  const visible = facts.aberrationSpot > facts.coc;
  if (locale === 'en') {
    const now =
      facts.lens === 'biconcave'
        ? `With the diverging lens mounted, the pine reaches the glass as a ${pine} smudge — bigger than the whole sensor!`
        : visible
          ? `With this lens and the current aperture, even a perfectly focused point becomes a ${spot} blob, big ` +
            `enough for the eye to notice. Close the diaphragm and watch the sharpness improve.`
          : `With this lens and the current aperture, a focused point becomes a blob of only ${spot}: too small for ` +
            `the eye to notice. Sharp!`;
    return [
      `You can mount three different lenses on the bench (key L):`,
      `Double Gauss: a real camera lens, with six glasses working as a team. Some of them fix the flaws of the ` +
        `others, and the image comes out really sharp.`,
      `Simple converging lens: a single glass, chubby in the middle. It gathers light in the same place as the ` +
        `double Gauss, but on its own it cannot fix its flaws: the rays passing near its edge meet a little ` +
        `before the others, and the image gets slightly soft.`,
      `Diverging lens: thin in the middle and thick at the edges. It does the opposite — it spreads light ` +
        `instead of gathering it. That is why it never forms an image on the ground glass, however much you ` +
        `turn the ring!`,
      now,
    ];
  }
  const now =
    facts.lens === 'biconcave'
      ? `Com a divergente montada, o pinheiro chega ao vidro como uma mancha de ${pine} — maior que o sensor inteiro!`
      : visible
        ? `Com esta lente e a abertura de agora, até um ponto bem focado vira uma bolinha de ${spot}, grande o ` +
          `bastante para o olho notar. Feche o diafragma e veja a nitidez melhorar.`
        : `Com esta lente e a abertura de agora, um ponto focado vira uma bolinha de só ${spot}: pequena demais ` +
          `para o olho perceber. Nítido!`;
  return [
    `Dá para montar três lentes diferentes na bancada (tecla L):`,
    `Gauss duplo: uma objetiva de câmera de verdade, com seis vidros trabalhando em equipe. Uns corrigem os ` +
      `defeitos dos outros, e a imagem sai bem nítida.`,
    `Convergente simples: um vidro só, gordinho no meio. Ela junta a luz no mesmo lugar que o Gauss duplo, mas ` +
      `sozinha não consegue corrigir seus defeitos: os raios que passam pela borda se encontram um pouquinho ` +
      `antes dos outros, e a imagem fica levemente embaçada.`,
    `Divergente: fininha no meio e grossa nas bordas. Ela faz o contrário — espalha a luz em vez de juntar. Por ` +
      `isso nunca forma imagem no vidro fosco, por mais que você gire o anel!`,
    now,
  ];
}

/** Os exageros de escala (SPEC §6.2), contados de um jeito simples. */
function scalesText(locale: Locale): string[] {
  const en = locale === 'en';
  const times = (factor: number): string => formatNumber(factor, 0, locale);
  return activeScaleDisclosures(locale).map((d) => {
    switch (d.id) {
      case 'lens':
        return en
          ? `The lens is drawn ${times(d.factor)} times bigger than in real life, so you can see its glasses and ` +
              `the diaphragm blades. Everything grew together, in the same proportion.`
          : `A objetiva está desenhada ${times(d.factor)} vezes maior que na vida real, para você enxergar os ` +
              `vidros e as lâminas do diafragma. Tudo cresceu junto, na mesma proporção.`;
      case 'image-plane':
        return en
          ? `The ground glass and what appears on it are enlarged ${times(d.factor)} times more, so the blur ` +
              `blobs are big enough to see. Which blob is bigger or smaller does not change.`
          : `O vidro fosco e o que aparece nele estão ampliados mais ${times(d.factor)} vezes, para as bolinhas de ` +
              `borrão ficarem visíveis. Qual bolinha é maior ou menor continua igual.`;
      case 'diorama-depth':
        return en
          ? `The valley would never fit on the bench at its real size, so its distances were squeezed like an ` +
              `accordion: faraway things are packed much tighter than nearby ones. The order of things, and who is ` +
              `in focus, stay exactly right.`
          : `O vale nunca caberia na bancada no tamanho real, então as distâncias dele foram apertadas como uma ` +
              `sanfona: o que está longe fica bem mais espremido que o que está perto. A ordem das coisas, e quem ` +
              `está em foco, continuam certinhas.`;
      default:
        return `${d.label}. ${d.explanation}`;
    }
  });
}

function sectionsFor(facts: Facts, locale: Locale): Record<string, string> {
  const focus = formatDistance(facts.focusDistance, locale);
  const en = locale === 'en';
  // Um disco abaixo de um micrômetro é, para todos os efeitos, um ponto.
  const disc = (value: number): string => {
    if (value < 0.001) return en ? 'a sharp point' : 'um ponto nítido';
    return en ? `a ${mm(value, locale)} blob` : `uma bolinha de ${mm(value, locale)}`;
  };
  const zone = Number.isFinite(facts.dofTotal) ? cm(facts.dofTotal, locale) : en ? 'no end' : 'sem fim';
  const near = formatDistance(facts.dofNear, locale);
  const far = formatDistance(facts.dofFar, locale);
  const pupil = mm(facts.pupilDiameter, locale);
  const extension = mm(facts.extension, locale);
  const paragraphs = (list: readonly string[]): string => list.join('\n\n');

  if (en) {
    return {
      sharp: paragraphs([
        `Think of the lens as a "light catcher": it takes the light leaving each little point of an object and ` +
          `gathers it back into a little point on the other side. The funny part is that it can only do this ` +
          `perfectly for one distance at a time. Right now that distance is ${focus}. Everything at exactly that ` +
          `distance forms an invisible wall — the plane of focus — shown here as the cyan sheet crossing the valley.`,
        `Luckily our eyes are generous: a little in front of or behind that sheet still looks sharp. That band ` +
          `is the sharp zone, and right now it is ${zone} deep (from ${near} to ${far}). Whatever is inside it ` +
          `looks great in the photo!`,
      ]),
      blur: paragraphs([
        `Picture the light from a point as a cone — like an ice-cream cone made of light — that the lens narrows ` +
          `down to a tip. If the tip lands right on the glass, the point shows up as a point. If the tip lands ` +
          `before or after the glass, the glass "slices" the cone halfway and what shows up is a blurry blob.`,
        `Look at the rings drawn on the ground glass: each one shows the blob of one object in the valley. With ` +
          `the current focus, the pine becomes ${disc(facts.blurPine)}, the cabin ${disc(facts.blurCabin)} and ` +
          `the peak ${disc(facts.blurPeak)}. The bigger the blob, the blurrier the object.`,
      ]),
      ring: paragraphs([
        `When you turn the focus ring there is no magic inside: the whole lens just slides a little forwards or ` +
          `backwards, away from or towards the sensor. Faraway things need the lens closer to the sensor; nearby ` +
          `things need it farther away.`,
        `To focus at ${focus}, the lens is ${extension} farther out than it would be for things very far away. ` +
          `It seems tiny, but it is enough to move the invisible wall of focus across the whole valley! Try ` +
          `keys 1, 2 and 3.`,
      ]),
      aperture: paragraphs([
        `The diaphragm is the camera's pupil: nine little blades that open and close a hole in the middle of ` +
          `the lens. A big hole lets in lots of light, but the light cones get fat and everything out of focus ` +
          `blurs a lot — that is the dreamy background of portrait photos. A small hole lets in less light, the ` +
          `cones get thin and almost everything looks sharp.`,
        `Right now the hole is ${pupil} across. Close the aperture with the round buttons on the console and ` +
          `watch the sharp zone grow. Your eye does the same thing: on a sunny day your pupil shrinks and you see ` +
          `sharply near and far at the same time.`,
      ]),
      'upside-down': paragraphs([
        `Notice something? The image on the ground glass is upside down! It is not a bug. Light from the top of ` +
          `the mountain goes down, passes through the middle of the lens and keeps going down to the bottom of ` +
          `the glass. Light from the bottom does the opposite. They cross at the lens, and the image flips.`,
        `And here is the fun part: the same thing happens inside your eye. The image on your retina is upside ` +
          `down, and your brain flips it back without you noticing. A camera does the same, using software.`,
      ]),
      scales: paragraphs([
        `An honest warning: some things here are not at their real size, so they fit on the screen and are easy to see.`,
        ...scalesText(locale),
        `The rays of light follow these drawings, but the point where each cone closes is calculated with the ` +
          `real measurements. The blur you see in the valley is a picture of the blur that physics computes for ` +
          `each point.`,
        `Credits: this lens experiment was inspired by “The Plane of Focus”, at sael.net/plane-of-focus ` +
          `(@ryansael), whose design, lighting and console it follows.`,
      ]),
      swap: paragraphs(swapText(facts, locale)),
      lens: lensText(facts, locale),
    };
  }

  return {
    sharp: paragraphs([
      `Pense na lente como uma "pegadora de luz": ela pega a luz que sai de cada pontinho de um objeto e junta ` +
        `tudo de novo num pontinho do outro lado. O curioso é que ela só consegue fazer isso perfeitamente para ` +
        `uma distância de cada vez. Agora, essa distância é ${focus}. Tudo o que está exatamente a essa distância ` +
        `forma uma parede invisível — o plano de foco —, que aqui aparece como a lâmina ciano atravessando o vale.`,
      `Ainda bem que nossos olhos são generosos: um pouquinho antes ou depois da lâmina ainda parece nítido. Essa ` +
        `faixa é a zona nítida, e agora ela tem ${zone} (de ${near} a ${far}). Quem estiver dentro dela sai ` +
        `bonito na foto!`,
    ]),
    blur: paragraphs([
      `Imagine a luz de um ponto como um cone — uma casquinha de sorvete feita de luz — que a lente vai afinando ` +
        `até virar uma ponta. Se a ponta cai bem em cima do vidro, o ponto aparece como ponto. Se a ponta cai ` +
        `antes ou depois, o vidro "corta" a casquinha no meio do caminho, e o que aparece é uma bolinha borrada.`,
      `Olhe os anéis desenhados no vidro fosco: cada um mostra a bolinha de um objeto do vale. Com o foco de ` +
        `agora, o pinheiro vira ${disc(facts.blurPine)}, a cabana, ${disc(facts.blurCabin)} e o pico, ` +
        `${disc(facts.blurPeak)}. Quanto maior a bolinha, mais borrado fica o objeto.`,
    ]),
    ring: paragraphs([
      `Quando você gira o anel de foco, não acontece mágica nenhuma lá dentro: a lente inteira só anda um ` +
        `pouquinho para a frente ou para trás, se afastando ou se aproximando do sensor. Para coisas longe, ela ` +
        `fica mais perto do sensor; para coisas pertinho, precisa se afastar.`,
      `Para focar em ${focus}, a lente está ${extension} mais afastada do que ficaria para coisas muito longe. ` +
        `Parece pouco, mas é o bastante para levar a parede invisível do foco pelo vale inteiro! Experimente as ` +
        `teclas 1, 2 e 3.`,
    ]),
    aperture: paragraphs([
      `O diafragma é a pupila da câmera: nove laminazinhas que abrem e fecham um buraco no meio da lente. Buraco ` +
        `grande deixa entrar muita luz, mas as casquinhas de luz ficam gordas, e o que está fora de foco borra ` +
        `bastante — é aquele fundo bem desfocado das fotos de retrato. Buraco pequeno deixa entrar menos luz, as ` +
        `casquinhas ficam finas e quase tudo parece nítido.`,
      `Agora o buraco tem ${pupil} de largura. Feche a abertura nos botões redondos do console e veja a zona ` +
        `nítida crescer. Seu olho faz a mesma coisa: num dia de sol, a pupila fecha e você enxerga nítido de ` +
        `perto e de longe ao mesmo tempo.`,
    ]),
    'upside-down': paragraphs([
      `Reparou? A imagem no vidro fosco está de ponta-cabeça! Não é defeito. A luz que sai do topo da montanha ` +
        `desce, passa pelo meio da lente e continua descendo até a parte de baixo do vidro. A luz de baixo faz o ` +
        `caminho contrário. Elas se cruzam na lente, e a imagem vira.`,
      `E o mais legal: isso também acontece dentro do seu olho. A imagem na sua retina é invertida, e o cérebro ` +
        `desvira tudo sem você perceber. A câmera faz o mesmo, só que com um programa.`,
    ]),
    scales: paragraphs([
      `Um aviso sincero: algumas coisas aqui não estão no tamanho real, para caberem na tela e ficarem fáceis de ver.`,
      ...scalesText(locale),
      `Os raios de luz seguem esses desenhos, mas o ponto onde cada cone se fecha é calculado com as medidas ` +
        `reais. O borrado que você vê no vale é um retrato do borrão que a física calcula para cada ponto.`,
      `Créditos: este experimento com lentes foi inspirado em “The Plane of Focus”, em sael.net/plane-of-focus ` +
        `(@ryansael), cujo desenho, iluminação e console ele segue.`,
    ]),
    swap: paragraphs(swapText(facts, locale)),
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
  { keys: 'V', description: { 'pt-BR': 'assistir ao vídeo explicativo', en: 'watch the explainer video' } },
] as const;
