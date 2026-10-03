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
      section('exponential', 'Largura e altura', 'Width and height'),
      section('stm', 'Onde isso aparece', 'Where this shows up'),
      section('scales', 'Sobre as escalas', 'About the scales'),
    ],
  };
}

function sections(f: TunnelingFacts, locale: Locale): Record<string, string> {
  const n = (value: number, decimals: number): string => formatNumber(value, decimals, locale);
  const E = formatEv(f.energy, locale);
  const V = formatEv(f.height, locale);
  const a = formatNm(f.width, locale);
  const T = percent(f.transmission, locale);
  const Tw = percent(f.transmissionWider, locale);
  const kappa = `${n(f.kappa * 1e-9, 2)} nm⁻¹`;
  const decay = `${n(f.decayLength * 1e9, 3)} nm`;
  const lambda = `${n(f.wavelength * 1e9, 2)} nm`;
  const below = f.energy < f.height;

  if (locale === 'en') {
    return {
      experiment:
        `A gun fires electrons of ${E} at a wall ${V} high and ${a} wide. Here height is energy, as in the ` +
        `textbook energy diagram: the beam runs at the electron's energy, and the wall is as high as the barrier. ` +
        `A ball rolling lower than the wall would always bounce back.\n\n` +
        `Each electron draws its fate with the exact probability: most bounce back; a few cross the wall as a fading ` +
        `ghost and reappear on the other side with a golden flash, reaching the collector. The counter shows the ` +
        `measured fraction approaching the computed one, ${T}.`,
      wave:
        `Above the beam you see the electron's wave, the exact solution of the Schrödinger equation for this ` +
        `wall. Before the wall it oscillates (wavelength ${lambda}) and mixes with the reflected part. Inside, ` +
        (below
          ? `it does not oscillate: it decays as e^(−κx), with κ = ${kappa} — it falls by a factor e every ${decay}. `
          : `the electron is above the wall, so the wave keeps oscillating, only with a longer wavelength. `) +
        `Whatever is left at the far side goes on as a smaller wave: the part that tunnelled.`,
      exponential:
        `For a wide wall, T ≈ 16E(V₀ − E)/V₀² · e^(−2κa). The width sits in the exponent: making the wall 0.1 nm ` +
        `wider takes T from ${T} to ${Tw}. A higher wall raises κ and makes the drop steeper. That is why tunnelling ` +
        `only matters at the scale of atoms: at 1 mm, T would be zero for every practical purpose.`,
      stm:
        `The scanning tunnelling microscope (Binnig and Rohrer, Nobel Prize 1986) uses exactly this: a metal tip ` +
        `a few tenths of a nanometre from a surface, a small voltage, and the current that tunnels through the ` +
        `gap. Because it falls exponentially with the distance, moving the tip by 0.1 nm (about the size of an atom) ` +
        `changes the current about ten times — enough to see individual atoms. Tunnelling also explains alpha decay, flash memory and ` +
        `the tunnel diode.`,
      scales:
        `Height is energy: ${n(0.12 * 100, 0)} cm per eV. Width is magnified 400 million times: 1 nm is drawn as ` +
        `40 cm. The wave is drawn as amplitude |ψ| (not |ψ|², which would hide the tunnelled part) and oscillates ` +
        `far slower than the real one. The ghost inside the wall is a picture of the decaying wave, not of a ` +
        `particle losing energy. Each dot stands for many electrons: the current shown is I₀·T, computed by the engine.`,
    };
  }

  return {
    experiment:
      `Um canhão dispara elétrons de ${E} contra um muro de ${V} de altura e ${a} de largura. Aqui altura é ` +
      `energia, como no diagrama de energia dos livros: o feixe corre na energia do elétron, e o muro tem a altura ` +
      `da barreira. Uma bolinha rolando mais baixo que o muro sempre voltaria.\n\n` +
      `Cada elétron sorteia o destino com a probabilidade exata: a maioria volta; alguns atravessam o muro como um ` +
      `fantasma que se apaga e reaparecem do outro lado num clarão dourado, até o coletor. O contador mostra a ` +
      `fração medida se aproximando da calculada, ${T}.`,
    wave:
      `Acima do feixe está a onda do elétron, a solução exata da equação de Schrödinger para este muro. Antes ` +
      `dele, ela oscila (comprimento de onda ${lambda}) e se mistura com a parte refletida. Dentro, ` +
      (below
        ? `ela não oscila: decai como e^(−κx), com κ = ${kappa} — cai por um fator e a cada ${decay}. `
        : `o elétron está acima do muro, então a onda continua oscilando, só que com comprimento maior. `) +
      `O que sobra do outro lado segue como uma onda menor: a parte que tunelou.`,
    exponential:
      `Para muro largo, T ≈ 16E(V₀ − E)/V₀² · e^(−2κa). A largura está no expoente: deixar o muro 0,1 nm mais ` +
      `largo leva T de ${T} para ${Tw}. Um muro mais alto aumenta κ e deixa a queda mais íngreme. Por isso o ` +
      `tunelamento só importa na escala dos átomos: a 1 mm, T seria zero para qualquer efeito prático.`,
    stm:
      `O microscópio de varredura por tunelamento (Binnig e Rohrer, Nobel de 1986) usa exatamente isso: uma ponta ` +
      `de metal a poucos décimos de nanômetro de uma superfície, uma tensão pequena e a corrente que tunela pela ` +
      `fresta. Como ela cai exponencialmente com a distância, mover a ponta 0,1 nm (o tamanho de um átomo) muda ` +
      `a corrente cerca de dez vezes — o bastante para ver átomos um a um. O tunelamento também explica o decaimento alfa, a ` +
      `memória flash e o diodo túnel.`,
    scales:
      `Altura é energia: ${n(0.12 * 100, 0)} cm por eV. A largura está ampliada 400 milhões de vezes: 1 nm é ` +
      `desenhado como 40 cm. A onda é desenhada como amplitude |ψ| (não |ψ|², que esconderia a parte que tunela) e ` +
      `oscila muito mais devagar que a real. O fantasma dentro do muro é uma imagem da onda decaindo, não de uma ` +
      `partícula perdendo energia. Cada ponto representa muitos elétrons: a corrente mostrada é I₀·T, calculada ` +
      `pelo motor.`,
  };
}
