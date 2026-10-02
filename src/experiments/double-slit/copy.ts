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
const pm = (meters: number, locale: Locale): string => `${formatNumber(meters * 1e12, 2, locale)} pm`;

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
      section('fringes', 'De onde vêm as franjas', 'Where the fringes come from'),
      section('detector', 'O detector apaga as franjas', 'The detector erases the fringes'),
      section('distance', 'Perto e longe do anteparo', 'Near and far from the screen'),
      section('scales', 'Sobre as escalas e a cor', 'About the scales and the colour'),
    ],
  };
}

function sections(facts: DoubleSlitFacts, locale: Locale): Record<string, string> {
  const n = (value: number, decimals: number): string => formatNumber(value, decimals, locale);
  const lambda = pm(facts.wavelength, locale);
  const kv = n(facts.voltage / 1000, 0);
  const a = um(facts.slitWidth, locale, 1);
  const d = um(facts.separation, locale, 1);
  const L = `${n(facts.distance, 2)} m`;
  const spacing = um(facts.fringeSpacing, locale);
  const fresnel = n(facts.fresnelNumber, 2);
  const mag = n(facts.magnification, 0);

  if (locale === 'en') {
    return {
      experiment:
        `An electron gun accelerates electrons through ${kv} kV, the voltage of Claus Jönsson's 1961 experiment, the ` +
        `first double slit done with electrons. At that energy each electron behaves like a wave of length ` +
        `λ = h/p = ${lambda}. The slits are ${a} wide and ${d} apart; the screen is ${L} away.\n\n` +
        `The electrons arrive one at a time. Each one makes a single dot on the phosphor; the pattern only shows ` +
        `when many dots pile up.`,
      fringes:
        `Without detectors the wave passes through both slits at once. At each point of the screen the two parts ` +
        `arrive with a path difference: where it is a whole number of wavelengths they add, where it is half a ` +
        `wavelength they cancel. That gives bright and dark fringes, about λL/d = ${spacing} apart.\n\n` +
        `The pattern on the screen is computed with the Fresnel diffraction integral of the two slits, not drawn.`,
      detector:
        `A detector at each slit records which way every electron went. With that information there is nothing ` +
        `left to interfere: the screen shows the sum of the two single-slit patterns, |ψ₁|² + |ψ₂|², and the ` +
        `cross term that made the fringes disappears. Turn the detectors off and the fringes come back.\n\n` +
        `Covering a slit has the same effect on interference: with one path only, there is one band.`,
      distance:
        `The Fresnel number a²/(λL) is now ${fresnel}. Close to the slits (large number) each slit casts its own ` +
        `band, and with the detectors on the two bands are clearly apart. Far away (small number) the bands ` +
        `spread and merge, and without detectors the classic pattern appears, brightest in the middle. Move the ` +
        `screen and watch the transition.`,
      scales:
        `The real pattern is a few micrometres wide. Everything across the beam — slits, pattern, screen — is ` +
        `drawn ${mag}× larger; along the beam, distances are real. The wave drawn after the slits uses the ` +
        `wavelength that keeps its dark lines landing on the dark fringes of the drawn screen; the moving pulses ` +
        `on it, and the electrons' speed, are only visual. The screen image uses a high-contrast exposure ` +
        `curve (brightness ∝ intensity², like a photographic film); the positions of fringes and bands are the ` +
        `computed ones.\n\n` +
        `Electrons have no colour. The colour you choose is that of the phosphor on the screen — real screens are ` +
        `usually green — and of the drawn beam.`,
    };
  }

  return {
    experiment:
      `Um canhão acelera elétrons com ${kv} kV, a tensão do experimento de Claus Jönsson, de 1961, a primeira ` +
      `dupla fenda feita com elétrons. Nessa energia cada elétron se comporta como uma onda de comprimento ` +
      `λ = h/p = ${lambda}. As fendas têm ${a} de largura e ficam a ${d} uma da outra; o anteparo está a ${L}.\n\n` +
      `Os elétrons chegam um de cada vez. Cada um acende um único ponto no fósforo; o padrão só aparece quando ` +
      `muitos pontos se acumulam.`,
    fringes:
      `Sem detectores, a onda passa pelas duas fendas ao mesmo tempo. Em cada ponto do anteparo as duas partes ` +
      `chegam com uma diferença de caminho: onde ela é um número inteiro de comprimentos de onda, elas se somam; ` +
      `onde é meio comprimento, se cancelam. Daí as franjas claras e escuras, a cerca de λL/d = ${spacing} uma da ` +
      `outra.\n\n` +
      `O padrão no anteparo é calculado com a integral de difração de Fresnel das duas fendas, não desenhado.`,
    detector:
      `Um detector em cada fenda registra por onde cada elétron passou. Com essa informação não sobra o que ` +
      `interferir: o anteparo mostra a soma dos padrões de cada fenda sozinha, |ψ₁|² + |ψ₂|², e o termo cruzado ` +
      `que fazia as franjas some. Desligue os detectores e as franjas voltam.\n\n` +
      `Tampar uma fenda tem o mesmo efeito sobre a interferência: com um caminho só, fica uma faixa só.`,
    distance:
      `O número de Fresnel a²/(λL) agora é ${fresnel}. Perto das fendas (número grande), cada fenda projeta a ` +
      `própria faixa, e com os detectores ligados as duas faixas ficam bem separadas. Longe (número pequeno), as ` +
      `faixas se espalham e se juntam, e sem detectores aparece o padrão clássico, mais claro no meio. Mova o ` +
      `anteparo e veja a transição.`,
    scales:
      `O padrão real tem poucos micrômetros. Tudo o que é transversal ao feixe — fendas, padrão, anteparo — está ` +
      `desenhado ${mag}× maior; ao longo do feixe, as distâncias são reais. A onda desenhada depois das fendas usa ` +
      `o comprimento de onda que faz as linhas escuras dela caírem nas franjas escuras do anteparo desenhado; os ` +
      `pulsos que andam nela, e a velocidade dos elétrons, são só visuais. A imagem do anteparo usa uma curva ` +
      `de exposição de alto contraste (brilho ∝ intensidade², como num filme fotográfico); a posição das ` +
      `franjas e das faixas é a calculada.\n\n` +
      `Elétron não tem cor. A cor escolhida é a do fósforo do anteparo — os reais costumam ser verdes — e a do ` +
      `feixe desenhado.`,
  };
}
