import type { ExperimentCopy, HudHighlight, Locale } from '../../core/experiment';
import type { PlateMode, PlateShape } from '../../optics/acoustics/chladni';
import { formatNumber } from '../../ui/i18n';

/**
 * Textos das figuras de Chladni, em pt-BR e inglês (ADR 0018). Todo número
 * chega calculado pelo motor em `ChladniFacts`.
 */

export interface ChladniFacts {
  readonly shape: PlateShape;
  /** Frequência do excitador, Hz. */
  readonly frequency: number;
  /** Modo dominante e a amplitude dele (0 a 1); em ressonância ou não. */
  readonly mode: PlateMode | null;
  readonly strength: number;
  readonly resonant: boolean;
  /** Linhas nodais do modo dominante. */
  readonly nodalLines: number;
  /** Modo mais próximo em frequência e a frequência dele. */
  readonly nearest: PlateMode | null;
  /** Fator de qualidade e a meia largura da ressonância, Hz. */
  readonly q: number;
  readonly halfWidth: number;
  /** Tamanho real da placa (lado ou raio), m. */
  readonly size: number;
  readonly sand: number;
}

export const formatHz = (hz: number, locale: Locale): string =>
  hz >= 1000 ? `${formatNumber(hz, 0, locale)} Hz` : `${formatNumber(hz, 1, locale)} Hz`;

export const formatMode = (mode: PlateMode | null): string => (mode ? `(${mode.n}, ${mode.m})` : '—');

export function describeChladni(f: ChladniFacts, locale: Locale): { sentence: string; highlights: HudHighlight[] } {
  const en = locale === 'en';
  const mode = formatMode(f.mode);
  const hz = formatHz(f.frequency, locale);
  if (f.resonant && f.mode) {
    return {
      sentence: en
        ? `Resonance at ${hz}: mode ${mode}. The plate shakes hard and the sand runs away from the parts that move, ` +
          `piling up on the ${f.nodalLines} nodal lines, where the plate stands still.`
        : `Ressonância em ${hz}: modo ${mode}. A placa treme forte e a areia foge das partes que se mexem, ` +
          `juntando-se nas ${f.nodalLines} linhas nodais, onde a placa fica parada.`,
      highlights: [
        { text: en ? 'Resonance' : 'Ressonância', tone: 'focus' },
        { text: mode, tone: 'strong' },
      ],
    };
  }
  const nearest = f.nearest ? `${formatMode(f.nearest)}, ${formatHz(f.nearest.frequency, locale)}` : '—';
  return {
    sentence: en
      ? `Between resonances: the plate barely moves and several weak modes mix — the sand does not make a ` +
        `pattern. The nearest mode is ${nearest}.`
      : `Entre ressonâncias: a placa mal se mexe e vários modos fracos se misturam — a areia não forma desenho. ` +
        `O modo mais próximo é ${nearest}.`,
    highlights: [{ text: en ? 'Between resonances' : 'Entre ressonâncias', tone: 'warm' }],
  };
}

export const CHLADNI_SHORTCUTS = [
  { keys: '[ ]', description: { 'pt-BR': 'modo anterior ou seguinte', en: 'previous or next mode' } },
  { keys: '- =', description: { 'pt-BR': 'baixar ou subir a frequência', en: 'lower or raise the frequency' } },
  { keys: ', .', description: { 'pt-BR': 'sintonia fina', en: 'fine tuning' } },
  { keys: 'F', description: { 'pt-BR': 'placa quadrada ou circular', en: 'square or circular plate' } },
  { keys: 'B', description: { 'pt-BR': 'espalhar a areia de novo', en: 'scatter the sand again' } },
  { keys: 'M', description: { 'pt-BR': 'ligar ou desligar o som', en: 'sound on or off' } },
  { keys: 'N', description: { 'pt-BR': 'varredura de frequência', en: 'frequency sweep' } },
] as const;

export function buildChladniCopy(f: ChladniFacts): ExperimentCopy {
  const pt = sections(f, 'pt-BR');
  const en = sections(f, 'en');
  const section = (id: string, headingPt: string, headingEn: string) => ({
    id,
    heading: { 'pt-BR': headingPt, en: headingEn },
    body: { 'pt-BR': pt[id]!, en: en[id]! },
  });
  return {
    title: { 'pt-BR': 'Figuras de Chladni', en: 'Chladni figures' },
    subtitle: {
      'pt-BR':
        'Uma placa de aço vibrando e areia por cima. Procure as frequências em que a placa entra em ressonância: a areia desenha sozinha as linhas que não se mexem.',
      en: 'A steel plate vibrating with sand on top. Hunt for the frequencies where the plate resonates: the sand draws, by itself, the lines that stand still.',
    },
    shortcuts: CHLADNI_SHORTCUTS,
    sections: [
      section('experiment', 'O experimento', 'The experiment'),
      section('nodes', 'As linhas que não se mexem', 'The lines that stand still'),
      section('resonance', 'Ressonância', 'Resonance'),
      section('history', 'Uma história de 1787', 'A story from 1787'),
      section('scales', 'Sobre os tamanhos', 'About the sizes'),
    ],
  };
}

function sections(f: ChladniFacts, locale: Locale): Record<string, string> {
  const paragraphs = (list: readonly string[]): string => list.join('\n\n');
  const hz = formatHz(f.frequency, locale);
  const size = formatNumber(f.size * 100 * (f.shape === 'circle' ? 2 : 1), 0, locale);
  const halfWidth = formatNumber(f.halfWidth, 1, locale);

  if (locale === 'en') {
    return {
      experiment: paragraphs([
        `A thin steel plate is screwed onto a vibrator, and the vibrator is fed by the generator on the side, now ` +
          `at ${hz}. Sand was sprinkled all over the plate. Slide the frequency and watch: most of the time, nothing ` +
          `happens… until, at certain frequencies, the sand jumps around and draws a pattern!`,
        `Turn on the sound to hear the frequency (it is the real one), try the circular plate and use the sweep to ` +
          `visit the resonances one by one.`,
      ]),
      nodes: paragraphs([
        `When the plate vibrates in one of its "modes", some parts go up and down a lot and other parts stay still. ` +
          `The sand on the parts that move gets thrown around; the sand that falls on the still parts stays there. ` +
          `Little by little, all the sand collects on the lines that do not move: the nodal lines.`,
        `Each mode has its own pattern. The higher the frequency, the more lines and the more intricate the design.`,
      ]),
      resonance: paragraphs([
        `A swing goes high when you push it at just the right rhythm — that is resonance. The plate is the same: it ` +
          `has favourite frequencies, and only at them does it shake hard. Miss by a little more than ${halfWidth} Hz ` +
          `and the effect fades: use the fine tuning!`,
        `Between resonances, the plate barely moves and several weak modes mix together: there is no clear pattern.`,
      ]),
      history: paragraphs([
        `Ernst Chladni, a German physicist and musician, rubbed a violin bow on the edge of sand-covered plates and ` +
          `published these drawings in 1787. Napoleon was so impressed that he offered a prize to whoever explained ` +
          `them — won by the French mathematician Sophie Germain, who created the theory of vibrating plates. Today ` +
          `the same idea is used to tune guitar and violin tops.`,
      ]),
      scales: paragraphs([
        `The plate is drawn 3.5 times bigger than the real one (${size} cm of steel, 0.8 mm thick). The vibration ` +
          `appears in slow motion and greatly enlarged: the real plate vibrates hundreds of times per second, with ` +
          `amplitudes of thousandths of a millimetre.`,
        `Idealised model: the square plate uses the classic Chladni and Rayleigh approximation, with free edges; the ` +
          `circular one, Bessel modes with a still edge. All modes are excited equally, as if the vibrator pushed ` +
          `them all with the same strength — on a real plate, where you push changes that.`,
      ]),
    };
  }

  return {
    experiment: paragraphs([
      `Uma placa fina de aço está presa num vibrador, e o vibrador é alimentado pelo gerador ao lado, agora em ${hz}. ` +
        `Espalhamos areia por toda a placa. Deslize a frequência e observe: quase sempre nada acontece… até que, em ` +
        `certas frequências, a areia pula e desenha uma figura!`,
      `Ligue o som para ouvir a frequência (é a de verdade), experimente a placa redonda e use a varredura para ` +
        `visitar as ressonâncias uma a uma.`,
    ]),
    nodes: paragraphs([
      `Quando a placa vibra num dos seus "modos", algumas partes sobem e descem muito e outras ficam paradas. A ` +
        `areia que está nas partes que se mexem é jogada para longe; a que cai nas partes paradas fica ali. Aos ` +
        `poucos, toda a areia se junta nas linhas que não se mexem: as linhas nodais.`,
      `Cada modo tem o seu desenho. Quanto mais alta a frequência, mais linhas e mais caprichado o desenho.`,
    ]),
    resonance: paragraphs([
      `Um balanço sobe alto quando você empurra no ritmo certinho — isso é ressonância. A placa é igual: ela tem ` +
        `frequências preferidas, e só nelas treme forte. Errou por pouco mais de ${halfWidth} Hz e o efeito some: use ` +
        `a sintonia fina!`,
      `Entre as ressonâncias, a placa mal se mexe e vários modos fracos se misturam: não aparece desenho nenhum.`,
    ]),
    history: paragraphs([
      `Ernst Chladni, físico e músico alemão, esfregava um arco de violino na borda de placas cobertas de areia e ` +
        `publicou esses desenhos em 1787. Napoleão ficou tão impressionado que ofereceu um prêmio a quem os ` +
        `explicasse — e quem ganhou foi a matemática francesa Sophie Germain, que criou a teoria das placas ` +
        `vibrantes. Hoje a mesma ideia ajuda a afinar tampos de violões e violinos.`,
    ]),
    scales: paragraphs([
      `A placa está desenhada 3,5 vezes maior que a real (${size} cm de aço, com 0,8 mm de espessura). A vibração ` +
        `aparece em câmera lenta e muito ampliada: a placa de verdade vibra centenas de vezes por segundo, com ` +
        `amplitudes de milésimos de milímetro.`,
      `Modelo idealizado: a placa quadrada usa a aproximação clássica de Chladni e Rayleigh, com bordas livres; a ` +
        `redonda, modos de Bessel com a borda parada. Todos os modos são excitados por igual, como se o vibrador ` +
        `empurrasse todos com a mesma força — numa placa de verdade, o ponto onde se empurra muda isso.`,
    ]),
  };
}
