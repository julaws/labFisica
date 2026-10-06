import type { ExperimentCopy, HudHighlight, Locale } from '../../core/experiment';
import { formatNumber } from '../../ui/i18n';

/**
 * Textos do experimento do tunelamento, em pt-BR e inglês (ADR 0011). Todo
 * número chega calculado pelo motor em `TunnelingFacts`.
 */

export interface TunnelingFacts {
  /** Energia do elétron e altura da barreira, eV; largura, m. */
  readonly energy: number;
  readonly height: number;
  readonly width: number;
  /** Corrente do feixe e corrente que tunela, A. */
  readonly incident: number;
  readonly current: number;
  /** Transmissão exata e a aproximação de barreira larga (NaN acima dela). */
  readonly transmission: number;
  readonly approximate: number;
  /** κ (1/m) e o comprimento de decaimento 1/κ (m); λ de de Broglie (m). */
  readonly kappa: number;
  readonly decayLength: number;
  readonly wavelength: number;
  /** T com a barreira 0,1 nm mais larga: quanto cai por décimo de nanômetro. */
  readonly transmissionWider: number;
}

const percent = (value: number, locale: Locale): string => {
  if (value >= 0.995) return `${formatNumber(value * 100, 1, locale)}%`;
  if (value >= 0.01) return `${formatNumber(value * 100, 2, locale)}%`;
  if (value >= 1e-4) return `${formatNumber(value * 100, 3, locale)}%`;
  return `${formatNumber(value * 100, 5, locale)}%`;
};

export const formatPercent = percent;

export function formatCurrent(amperes: number, locale: Locale): string {
  if (amperes >= 1e-9) return `${formatNumber(amperes * 1e9, 2, locale)} nA`;
  if (amperes >= 1e-12) return `${formatNumber(amperes * 1e12, 2, locale)} pA`;
  return `${formatNumber(amperes * 1e15, 2, locale)} fA`;
}

export const formatEv = (ev: number, locale: Locale): string => `${formatNumber(ev, 2, locale)} eV`;
export const formatNm = (meters: number, locale: Locale): string => `${formatNumber(meters * 1e9, 2, locale)} nm`;

export function describeTunneling(f: TunnelingFacts, locale: Locale): { sentence: string; highlights: HudHighlight[] } {
  const en = locale === 'en';
  const T = percent(f.transmission, locale);
  const I = formatCurrent(f.current, locale);
  const E = formatEv(f.energy, locale);
  const V = formatEv(f.height, locale);
  const a = formatNm(f.width, locale);
  if (f.energy < f.height) {
    return {
      sentence: en
        ? `An electron of ${E} against a wall of ${V}: classically, none would get through. But its wave goes into ` +
          `the wall and decays — and, ${a} later, ${T} of it comes out on the other side. Tunnelling current: ${I}.`
        : `Um elétron de ${E} contra um muro de ${V}: classicamente, nenhum passaria. Mas a onda dele entra no muro ` +
          `e decai — e, ${a} depois, ${T} dela sai do outro lado. Corrente de tunelamento: ${I}.`,
      highlights: [
        { text: en ? 'none would get through' : 'nenhum passaria', tone: 'warm' },
        { text: T, tone: 'strong' },
        { text: I, tone: 'focus' },
      ],
    };
  }
  return {
    sentence: en
      ? `The wall (${V}) is lower than the electron's energy (${E}): classically, all would pass. But the wave still ` +
        `reflects off its edges: only ${T} gets through. Current: ${I}.`
      : `O muro (${V}) está abaixo da energia do elétron (${E}): classicamente, todos passariam. Mas a onda ainda ` +
        `reflete nas bordas dele: só ${T} atravessa. Corrente: ${I}.`,
    highlights: [
      { text: en ? 'all would pass' : 'todos passariam', tone: 'warm' },
      { text: T, tone: 'strong' },
    ],
  };
}

export const TUNNELING_SHORTCUTS = [
  { keys: '[ ]', description: { 'pt-BR': 'muro mais fino ou mais largo', en: 'thinner or wider wall' } },
  { keys: ', .', description: { 'pt-BR': 'muro mais baixo ou mais alto', en: 'lower or higher wall' } },
  { keys: '- =', description: { 'pt-BR': 'menos ou mais elétrons no feixe', en: 'fewer or more electrons in the beam' } },
  { keys: 'O', description: { 'pt-BR': 'mostrar ou esconder a onda', en: 'show or hide the wave' } },
] as const;

export function buildTunnelingCopy(f: TunnelingFacts): ExperimentCopy {
  const pt = sections(f, 'pt-BR');
  const en = sections(f, 'en');
  const section = (id: string, headingPt: string, headingEn: string) => ({
    id,
    heading: { 'pt-BR': headingPt, en: headingEn },
    body: { 'pt-BR': pt[id]!, en: en[id]! },
  });
  return {
    title: { 'pt-BR': 'O tunelamento', en: 'Quantum tunnelling' },
    subtitle: {
      'pt-BR':
        'Elétrons contra um muro de energia mais alto que eles. Classicamente, ninguém passa. Mude a altura e a largura do muro e conte quantos atravessam mesmo assim.',
      en: 'Electrons against an energy wall higher than they are. Classically, nobody gets through. Change the height and width of the wall and count how many cross anyway.',
    },
    shortcuts: TUNNELING_SHORTCUTS,
    sections: [
      section('experiment', 'O experimento', 'The experiment'),
      section('wave', 'A onda dentro do muro', 'The wave inside the wall'),
      section('exponential', 'Um muro exigente', 'A picky wall'),
      section('stm', 'Onde isso aparece', 'Where this shows up'),
      section('scales', 'Sobre os tamanhos', 'About the sizes'),
    ],
  };
}

function sections(f: TunnelingFacts, locale: Locale): Record<string, string> {
  const T = percent(f.transmission, locale);
  const Tw = percent(f.transmissionWider, locale);
  const below = f.energy < f.height;
  const paragraphs = (list: readonly string[]): string => list.join('\n\n');

  if (locale === 'en') {
    return {
      experiment: paragraphs([
        `Imagine throwing a ball at a wall taller than it can jump. It bounces back, every single time. In the ` +
          `world of atoms, though, things are different! Here a cannon fires electrons at an "energy wall" — a ` +
          `barrier that, ` +
          (below
            ? `by everyday rules, none of them could ever get past.`
            : `right now, is lower than the electrons' energy, so by everyday rules all of them would get past.`),
        `Each electron "draws its luck": most bounce back, but every now and then one crosses the wall like a ` +
          `little ghost and reappears on the other side with a golden flash. The counter shows the fraction that ` +
          `made it, getting closer and closer to ${T}.`,
      ]),
      wave: paragraphs([
        `In quantum physics every electron is also a wave — that is what you see drawn above the beam. Before the ` +
          `wall, the wave wiggles up and down. ` +
          (below
            ? `When it enters the wall it does not stop all at once: it fades little by little, like a sound that ` +
              `goes through a wall and arrives muffled on the other side.`
            : `Right now the wall is lower than the electron's energy, so the wave does not even fade inside it: ` +
              `it wiggles right through. Even so, part of it bounces off the edges and goes back!`),
        `If the wall is thin enough, a little bit of wave is still left when it reaches the other side. That ` +
          `little bit is the chance of the electron showing up there: that is tunnelling!`,
      ]),
      exponential: paragraphs([
        `The wall is very picky about its width. Every extra bit makes the chance of getting through plummet: right ` +
          `now it is ${T}, but making the wall just a tenth of a nanometre wider (smaller than an atom!) drops it to ` +
          `${Tw}. A taller wall also gets in the way.`,
        `That is why you will never walk through a real wall: for something our size the chance is so small that, ` +
          `in practice, it is zero. Tunnelling only shows up in the tiny world of atoms.`,
      ]),
      stm: paragraphs([
        `Tunnelling is not just a curiosity — it is in your pocket! The memory in phones and USB sticks stores data ` +
          `by pushing electrons through ultra-thin barriers, by tunnelling.`,
        `It also made the scanning tunnelling microscope possible, which earned Binnig and Rohrer the 1986 Nobel ` +
          `Prize: a tiny metal tip glides over a surface and measures the electrons that tunnel to it. It is so ` +
          `sensitive that it can "see" atoms one by one! And inside the Sun, tunnelling helps atomic nuclei join ` +
          `together, which is what makes the star shine.`,
      ]),
      scales: paragraphs([
        `Here the height of the drawing stands for energy, not real height. The width of the wall is magnified 400 ` +
          `million times: one nanometre is drawn as 40 cm. The wave wiggles much slower than the real one, and the ` +
          `little ghost inside the wall is just a way of showing the wave fading. Each dot stands for many electrons.`,
      ]),
    };
  }

  return {
    experiment: paragraphs([
      `Imagine jogar uma bolinha contra um muro mais alto do que ela consegue pular. Ela volta, sempre. No mundo ` +
        `dos átomos, porém, as coisas são diferentes! Aqui, um canhão dispara elétrons contra um "muro de energia" — ` +
        `uma barreira que, ` +
        (below
          ? `pelas regras do dia a dia, nenhum deles conseguiria atravessar.`
          : `agora, está mais baixa que a energia dos elétrons, então pelas regras do dia a dia todos passariam.`),
      `Cada elétron "tira a sorte": a maioria volta, mas de vez em quando um deles atravessa o muro como um ` +
        `fantasminha e reaparece do outro lado num clarão dourado. O contador mostra a fração que passou, que vai ` +
        `chegando cada vez mais perto de ${T}.`,
    ]),
    wave: paragraphs([
      `Na física quântica, cada elétron também é uma onda — é ela que aparece desenhada acima do feixe. Antes do ` +
        `muro, a onda balança para cima e para baixo. ` +
        (below
          ? `Quando entra no muro, ela não para de uma vez: vai murchando aos poucos, como um som que atravessa uma ` +
            `parede e chega abafado do outro lado.`
          : `Agora o muro está mais baixo que a energia do elétron, então a onda nem murcha lá dentro: atravessa ` +
            `balançando. Mesmo assim, uma parte dela bate nas bordas e volta!`),
      `Se o muro for fino o bastante, ainda sobra um restinho de onda quando ela chega do outro lado. Esse ` +
        `restinho é a chance de o elétron aparecer lá: é o tunelamento!`,
    ]),
    exponential: paragraphs([
      `O muro é muito exigente com a largura. Cada pedacinho a mais faz a chance de atravessar despencar: agora ela ` +
        `é de ${T}, mas basta deixar o muro um décimo de nanômetro mais largo (menos que o tamanho de um átomo!) ` +
        `para ela cair para ${Tw}. Um muro mais alto também atrapalha.`,
      `É por isso que você nunca vai atravessar uma parede de verdade: para algo do nosso tamanho, a chance é tão ` +
        `pequena que, na prática, é zero. O tunelamento só aparece no mundo minúsculo dos átomos.`,
    ]),
    stm: paragraphs([
      `O tunelamento não é só curiosidade: ele está no seu bolso! A memória dos celulares e dos pendrives guarda ` +
        `dados empurrando elétrons através de barreiras finíssimas, por tunelamento.`,
      `Ele também permitiu criar o microscópio de tunelamento, que deu o Nobel de 1986 a Binnig e Rohrer: uma ` +
        `pontinha de metal passeia sobre uma superfície e mede os elétrons que tunelam até ela. É tão sensível que ` +
        `consegue "enxergar" átomos um por um! E, dentro do Sol, o tunelamento ajuda os núcleos dos átomos a se ` +
        `juntarem, e é isso que faz a estrela brilhar.`,
    ]),
    scales: paragraphs([
      `Aqui a altura do desenho representa energia, não altura de verdade. Já a largura do muro está ampliada 400 ` +
        `milhões de vezes: um nanômetro aparece como 40 cm. A onda balança bem mais devagar que a real, e o ` +
        `fantasminha dentro do muro é só um jeito de mostrar a onda murchando. Cada pontinho representa muitos ` +
        `elétrons.`,
    ]),
  };
}
