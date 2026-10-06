import type { ExperimentCopy, HudHighlight, Locale } from '../../core/experiment';
import { formatNumber } from '../../ui/i18n';

/**
 * Textos do experimento da dupla fenda, em pt-BR e inglês (ADR 0009). Todo
 * número chega calculado pelo motor em `DoubleSlitFacts`.
 */

export type PatternMode = 'wave' | 'particle' | 'single-left' | 'single-right' | 'none';

export interface DoubleSlitFacts {
  readonly mode: PatternMode;
  /** Comprimento de onda, m. */
  readonly wavelength: number;
  /** Tensão de aceleração, V. */
  readonly voltage: number;
  readonly slitWidth: number;
  readonly separation: number;
  readonly distance: number;
  /** Espaçamento das franjas λL/d, m. */
  readonly fringeSpacing: number;
  /** Franjas visíveis no anteparo (máximos acima de 15% do maior). */
  readonly fringeCount: number;
  readonly fresnelNumber: number;
  /** Ampliação transversal do desenho. */
  readonly magnification: number;
}

const um = (meters: number, locale: Locale, decimals = 2): string =>
  `${formatNumber(meters * 1e6, decimals, locale)} µm`;

export function patternLabel(mode: PatternMode, locale: Locale): string {
  const en = locale === 'en';
  switch (mode) {
    case 'wave':
      return en ? 'Wave' : 'Ondulatório';
    case 'particle':
      return en ? 'Particle' : 'Corpuscular';
    case 'single-left':
    case 'single-right':
      return en ? 'Single slit' : 'Fenda única';
    default:
      return en ? 'None' : 'Nenhum';
  }
}

/** Frase do HUD e os trechos que ela destaca. */
export function describeDoubleSlit(
  facts: DoubleSlitFacts,
  locale: Locale,
): { sentence: string; highlights: HudHighlight[] } {
  const en = locale === 'en';
  const spacing = um(facts.fringeSpacing, locale);
  const count = String(facts.fringeCount);
  switch (facts.mode) {
    case 'wave':
      return {
        sentence: en
          ? `Detectors off: nobody knows which slit the electron went through. The wave crosses both and ` +
            `interferes with itself — ${count} fringes, ${spacing} apart. Each electron still lands as a single dot.`
          : `Detectores desligados: ninguém sabe por qual fenda o elétron passou. A onda atravessa as duas e ` +
            `interfere consigo mesma — ${count} franjas, a ${spacing} uma da outra. Cada elétron ainda chega como um ponto.`,
        highlights: [
          { text: en ? 'Detectors off' : 'Detectores desligados', tone: 'focus' },
          { text: en ? `${count} fringes` : `${count} franjas`, tone: 'strong' },
          { text: spacing, tone: 'strong' },
        ],
      };
    case 'particle':
      return {
        sentence: en
          ? `Detectors on: every electron is caught in one slit. The interference vanishes and two bands are ` +
            `left, one behind each slit — the sum of two single slits.`
          : `Detectores ligados: cada elétron é flagrado numa das fendas. A interferência some e ficam duas ` +
            `faixas, uma atrás de cada fenda — a soma de duas fendas sozinhas.`,
        highlights: [
          { text: en ? 'Detectors on' : 'Detectores ligados', tone: 'warm' },
          { text: en ? 'two bands' : 'duas faixas', tone: 'strong' },
        ],
      };
    case 'single-left':
    case 'single-right': {
      const side =
        facts.mode === 'single-left' ? (en ? 'left' : 'esquerda') : en ? 'right' : 'direita';
      return {
        sentence: en
          ? `Only the ${side} slit is open: with nothing to interfere with, a single band forms, with faint ` +
            `diffraction fringes at its edges. The detector changes nothing — the path is already known.`
          : `Só a fenda ${side} aberta: sem a outra para interferir, fica uma faixa só, com franjas fracas de ` +
            `difração nas bordas. O detector não muda nada — o caminho já é conhecido.`,
        highlights: [{ text: en ? 'a single band' : 'uma faixa só', tone: 'strong' }],
      };
    }
    default:
      return {
        sentence: en
          ? 'Both slits are covered: no electron reaches the screen.'
          : 'As duas fendas estão tampadas: nenhum elétron chega ao anteparo.',
        highlights: [],
      };
  }
}

export const DOUBLE_SLIT_SHORTCUTS = [
  { keys: '1 2', description: { 'pt-BR': 'abrir ou tampar a fenda esquerda e a direita', en: 'open or cover the left and right slit' } },
  { keys: 'O', description: { 'pt-BR': 'observar: ligar ou desligar os detectores', en: 'observe: detectors on or off' } },
  { keys: 'V', description: { 'pt-BR': 'mostrar ou esconder o feixe', en: 'show or hide the beam' } },
  { keys: 'K', description: { 'pt-BR': 'próxima cor do fósforo', en: 'next phosphor colour' } },
  { keys: '[ ]', description: { 'pt-BR': 'aproximar ou afastar o anteparo', en: 'move the screen closer or farther' } },
  { keys: 'B', description: { 'pt-BR': 'assistir ao vídeo explicativo', en: 'watch the explainer video' } },
] as const;

export function buildDoubleSlitCopy(facts: DoubleSlitFacts): ExperimentCopy {
  const texts = (locale: Locale): Record<string, string> => sections(facts, locale);
  const pt = texts('pt-BR');
  const en = texts('en');
  const section = (id: string, headingPt: string, headingEn: string) => ({
    id,
    heading: { 'pt-BR': headingPt, en: headingEn },
    body: { 'pt-BR': pt[id]!, en: en[id]! },
  });

  return {
    title: { 'pt-BR': 'A dupla fenda', en: 'The double slit' },
    subtitle: {
      'pt-BR':
        'Elétrons, um de cada vez, contra duas fendas. Sem ninguém olhando, eles desenham franjas de onda. Ligue os detectores e veja o padrão mudar.',
      en: 'Electrons, one at a time, against two slits. With nobody watching, they draw wave fringes. Turn the detectors on and watch the pattern change.',
    },
    shortcuts: DOUBLE_SLIT_SHORTCUTS,
    sections: [
      section('experiment', 'O experimento', 'The experiment'),
      section('fringes', 'De onde vêm as listras', 'Where the stripes come from'),
      section('detector', 'Espiar apaga as listras', 'Peeking erases the stripes'),
      section('distance', 'Perto e longe da tela', 'Near and far from the screen'),
      section('scales', 'Sobre os tamanhos e a cor', 'About the sizes and the colour'),
    ],
  };
}

function sections(facts: DoubleSlitFacts, locale: Locale): Record<string, string> {
  const n = (value: number, decimals: number): string => formatNumber(value, decimals, locale);
  const kv = n(facts.voltage / 1000, 0);
  const spacing = um(facts.fringeSpacing, locale);
  const count = String(facts.fringeCount);
  const mag = n(facts.magnification, 0);
  const paragraphs = (list: readonly string[]): string => list.join('\n\n');

  if (locale === 'en') {
    return {
      experiment: paragraphs([
        `Imagine a cannon that fires electrons — tiny particles that live inside atoms — one at a time, at a ` +
          `plate with two very narrow slits. Behind it there is a screen that lights up a little dot wherever an ` +
          `electron lands. Here the electrons are pushed by ${kv} thousand volts.`,
        `This was first done with electrons in 1961, by Claus Jönsson, and the result left everyone amazed: at ` +
          `first the dots seem to land at random… but as they pile up, a pattern of bright and dark stripes appears!`,
      ]),
      fringes: paragraphs([
        `Stripes are the signature of a wave. Think of throwing two stones into a lake at the same time: the ` +
          `ripples meet, and in some places a crest meets a crest and the wave gets taller; in others a crest ` +
          `meets a trough and they cancel out.`,
        `Something similar happens with electrons: each one behaves like a wave that goes through both slits at ` +
          `once and meets itself on the other side. Where the waves add up, many electrons arrive (bright stripe); ` +
          `where they cancel, almost none (dark stripe). Right now there are ${count} stripes, ${spacing} apart — ` +
          `far thinner than a strand of hair!`,
      ]),
      detector: paragraphs([
        `Now comes the strangest part of quantum physics. Turn the detectors on: they "peek" at which slit each ` +
          `electron went through. The result? The stripes vanish! Only two bands are left, one behind each slit, ` +
          `as if the electrons were ordinary little balls.`,
        `It is as if the electron "knew" it was being watched: once someone finds out its path, it stops ` +
          `behaving like a wave. Turn the detectors off and the stripes come back. Covering one slit has a similar ` +
          `effect: with only one path, there is nothing to interfere with.`,
      ]),
      distance: paragraphs([
        `Drag the screen closer to the slits and farther away. Very close, each slit casts its own band, like the ` +
          `shadow of a window. As the screen moves away, the waves have room to spread out and mix, and the ` +
          `striped pattern appears, brightest in the middle. It is a lovely transition to watch!`,
      ]),
      scales: paragraphs([
        `The real pattern is tiny, just a few thousandths of a millimetre wide. So you can see it, everything ` +
          `across the beam (the slits, the stripes, the screen) is drawn ${mag} times bigger. Distances along the ` +
          `beam are real. The drawn wave and the speed of the electrons are just an illustration; the positions of ` +
          `the stripes are calculated by physics.`,
        `One more thing: electrons have no colour! The colour you pick is that of the screen material that glows ` +
          `when an electron hits it — on real screens it is usually green.`,
      ]),
    };
  }

  return {
    experiment: paragraphs([
      `Imagine um canhão que atira elétrons — partículas minúsculas que vivem dentro dos átomos —, um de cada vez, ` +
        `contra uma placa com duas fendas bem estreitinhas. Atrás dela há uma tela que acende um pontinho onde ` +
        `cada elétron bate. Aqui, os elétrons são empurrados por ${kv} mil volts.`,
      `Isso foi feito com elétrons pela primeira vez em 1961, por Claus Jönsson, e o resultado deixou todo mundo ` +
        `de queixo caído: no começo, os pontinhos parecem cair ao acaso… mas, conforme vão se acumulando, aparece ` +
        `um desenho de listras claras e escuras!`,
    ]),
    fringes: paragraphs([
      `Listras são a assinatura de uma onda. Pense em jogar duas pedras num lago ao mesmo tempo: as ondinhas se ` +
        `encontram, e em alguns lugares uma crista encontra outra crista e a onda fica mais alta; em outros, uma ` +
        `crista encontra um vale e as duas se apagam.`,
      `Com os elétrons acontece algo parecido: cada um se comporta como uma onda que passa pelas duas fendas ao ` +
        `mesmo tempo e se encontra consigo mesma do outro lado. Onde as ondas se reforçam, chegam muitos elétrons ` +
        `(listra clara); onde se apagam, quase nenhum (listra escura). Agora há ${count} listras, a ${spacing} ` +
        `uma da outra — muito mais fino que um fio de cabelo!`,
    ]),
    detector: paragraphs([
      `Agora vem a parte mais estranha da física quântica. Ligue os detectores: eles "espiam" por qual fenda cada ` +
        `elétron passou. Resultado? As listras somem! Ficam só duas faixas, uma atrás de cada fenda, como se os ` +
        `elétrons fossem bolinhas comuns.`,
      `É como se o elétron "soubesse" que está sendo observado: quando alguém descobre o caminho dele, ele deixa ` +
        `de se comportar como onda. Desligue os detectores e as listras voltam. Tampar uma das fendas tem um ` +
        `efeito parecido: com um caminho só, não há com quem interferir.`,
    ]),
    distance: paragraphs([
      `Arraste a tela para perto e para longe das fendas. Bem pertinho, cada fenda projeta a sua própria faixa, ` +
        `como a sombra de uma janela. Conforme a tela se afasta, as ondas ganham espaço para se espalhar e se ` +
        `misturar, e o desenho de listras vai aparecendo, mais forte no meio. É uma transformação bonita de ver!`,
    ]),
    scales: paragraphs([
      `O padrão de verdade é minúsculo, de poucos milésimos de milímetro. Para você conseguir ver, tudo o que fica ` +
        `de um lado a outro do feixe (as fendas, as listras, a tela) está desenhado ${mag} vezes maior. Já as ` +
        `distâncias ao longo do feixe são reais. A onda desenhada e a velocidade dos elétrons são só ilustração; ` +
        `a posição das listras é calculada pela física.`,
      `E um detalhe: elétron não tem cor! A cor que você escolhe é a do material da tela, que brilha quando o ` +
        `elétron bate — nas telas de verdade, costuma ser verde.`,
    ]),
  };
}
