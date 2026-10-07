import type { ExperimentCopy, HudHighlight, Locale } from '../../core/experiment';
import { formatNumber } from '../../ui/i18n';

/**
 * Textos do buraco negro, em pt-BR e inglês (ADR 0017). Todo número chega
 * calculado pelo motor em `BlackHoleFacts`.
 */

export interface BlackHoleFacts {
  /** Massa, massas solares; M = GM/c², km. */
  readonly mass: number;
  readonly gravitationalRadiusKm: number;
  /** Raio do horizonte 2M, km. */
  readonly horizonKm: number;
  /** Raio da esfera de fótons 3M e raio crítico 3√3 M, km. */
  readonly photonSphereKm: number;
  readonly criticalKm: number;
  /** Observador do telescópio: distância em km e em M. */
  readonly distanceKm: number;
  readonly distanceM: number;
  /** Raio angular da sombra, do anel de Einstein exato e do de campo fraco, rad. */
  readonly shadow: number;
  readonly ring: number;
  readonly ringWeak: number;
  /** Parâmetro de impacto do raio do anel (M) e a deflexão dele: exata e 4M/b, rad. */
  readonly ringImpact: number;
  readonly ringDeflection: number;
  readonly ringDeflectionWeak: number;
  /** Quanto a estrela está fora do alinhamento, rad. */
  readonly offset: number;
  readonly aligned: boolean;
  readonly insidePhotonSphere: boolean;
  readonly disk: boolean;
  /** Raio da região da esfera de vidro, km. */
  readonly orbRegionKm: number;
}

export const formatKm = (km: number, locale: Locale): string =>
  km >= 100 ? `${formatNumber(km, 0, locale)} km` : `${formatNumber(km, 1, locale)} km`;

export const formatDegrees = (radians: number, locale: Locale): string => {
  const degrees = (radians * 180) / Math.PI;
  return `${formatNumber(degrees, degrees >= 10 ? 1 : 2, locale)}°`;
};

export const formatSolarMasses = (mass: number, locale: Locale): string =>
  `${formatNumber(mass, mass >= 10 ? 0 : 1, locale)} M☉`;

export function describeBlackHole(f: BlackHoleFacts, locale: Locale): { sentence: string; highlights: HudHighlight[] } {
  const en = locale === 'en';
  const shadow = formatDegrees(f.shadow, locale);
  const ring = formatDegrees(f.ring, locale);
  const offset = formatDegrees(f.offset, locale);
  if (f.insidePhotonSphere) {
    return {
      sentence: en
        ? `The telescope is inside the photon sphere: the shadow covers more than half the sky (radius ${shadow}). ` +
          `Light that comes from behind you has to circle the black hole to reach you.`
        : `O telescópio está dentro da esfera de fótons: a sombra cobre mais da metade do céu (raio de ${shadow}). ` +
          `A luz que vem de trás de você precisa contornar o buraco negro para chegar.`,
      highlights: [
        { text: en ? 'inside the photon sphere' : 'dentro da esfera de fótons', tone: 'warm' },
        { text: shadow, tone: 'strong' },
      ],
    };
  }
  if (f.aligned) {
    return {
      sentence: en
        ? `Star, black hole and telescope lined up: the star's light goes around the black hole on every side and ` +
          `becomes an Einstein ring of ${ring}. The shadow has a radius of ${shadow}.`
        : `Estrela, buraco negro e telescópio alinhados: a luz da estrela contorna o buraco negro por todos os lados e ` +
          `vira um anel de Einstein de ${ring}. A sombra tem raio de ${shadow}.`,
      highlights: [
        { text: en ? 'Einstein ring' : 'anel de Einstein', tone: 'focus' },
        { text: ring, tone: 'strong' },
      ],
    };
  }
  return {
    sentence: en
      ? `The star is ${offset} away from the line-up: gravity bends its light and the telescope sees two images, one ` +
        `on each side of the shadow (radius ${shadow}). Line it up to see the ring.`
      : `A estrela está a ${offset} do alinhamento: a gravidade curva a luz dela e o telescópio vê duas imagens, uma ` +
        `de cada lado da sombra (raio de ${shadow}). Alinhe para ver o anel.`,
    highlights: [
      { text: en ? 'two images' : 'duas imagens', tone: 'focus' },
      { text: offset, tone: 'warm' },
    ],
  };
}

export const BLACK_HOLE_SHORTCUTS = [
  { keys: '[ ]', description: { 'pt-BR': 'menos ou mais massa', en: 'less or more mass' } },
  { keys: '- =', description: { 'pt-BR': 'telescópio mais perto ou mais longe', en: 'telescope closer or farther' } },
  { keys: 'I J K L', description: { 'pt-BR': 'mover a estrela de fundo', en: 'move the background star' } },
  { keys: 'O', description: { 'pt-BR': 'alinhar a estrela', en: 'line up the star' } },
  { keys: 'X', description: { 'pt-BR': 'ligar ou desligar o disco', en: 'accretion disk on or off' } },
  { keys: 'V', description: { 'pt-BR': 'visão realista ou didática', en: 'realistic or didactic view' } },
  { keys: 'B', description: { 'pt-BR': 'assistir ao vídeo explicativo', en: 'watch the explainer video' } },
] as const;

export function buildBlackHoleCopy(f: BlackHoleFacts): ExperimentCopy {
  const pt = sections(f, 'pt-BR');
  const en = sections(f, 'en');
  const section = (id: string, headingPt: string, headingEn: string) => ({
    id,
    heading: { 'pt-BR': headingPt, en: headingEn },
    body: { 'pt-BR': pt[id]!, en: en[id]! },
  });
  return {
    title: { 'pt-BR': 'O buraco negro', en: 'The black hole' },
    subtitle: {
      'pt-BR':
        'Um buraco negro numa esfera de vidro e um telescópio apontado para ele. A gravidade curva a luz: alinhe uma estrela atrás dele e veja o anel de Einstein.',
      en: 'A black hole in a glass sphere and a telescope pointed at it. Gravity bends light: line up a star behind it and watch the Einstein ring appear.',
    },
    shortcuts: BLACK_HOLE_SHORTCUTS,
    sections: [
      section('experiment', 'O experimento', 'The experiment'),
      section('shadow', 'A sombra e a esfera de fótons', 'The shadow and the photon sphere'),
      section('ring', 'O anel de Einstein', 'The Einstein ring'),
      section('disk', 'O disco que brilha', 'The glowing disk'),
      section('real', 'Isso existe de verdade', 'This is real'),
      section('scales', 'Sobre os tamanhos', 'About the sizes'),
    ],
  };
}

function sections(f: BlackHoleFacts, locale: Locale): Record<string, string> {
  const paragraphs = (list: readonly string[]): string => list.join('\n\n');
  const mass = formatSolarMasses(f.mass, locale);
  const horizon = formatKm(f.horizonKm, locale);
  const photon = formatKm(f.photonSphereKm, locale);
  const critical = formatKm(f.criticalKm, locale);
  const shadow = formatDegrees(f.shadow, locale);
  const ring = formatDegrees(f.ring, locale);
  const distance = formatKm(f.distanceKm, locale);
  const region = formatKm(f.orbRegionKm, locale);

  if (locale === 'en') {
    return {
      experiment: paragraphs([
        `Inside the glass sphere there is a black hole of ${mass} — and what you see in it is real physics: every ` +
          `pixel is a ray of light computed on its way from the camera, bending around the black hole. Drag the view ` +
          `around the bench and you are orbiting it!`,
        `The screen on the right is a telescope floating ${distance} away. Move the background star until it is ` +
          `exactly behind the black hole and watch what happens.`,
      ]),
      shadow: paragraphs([
        `Nothing escapes from inside the horizon, which here has a radius of ${horizon} — not even light. A little ` +
          `further out, at ${photon}, light can even travel in circles: that is the photon sphere, the golden ring ` +
          `of the didactic view.`,
        `Light that passes closer than ${critical} is swallowed. That is why the black hole casts a "shadow" larger ` +
          `than itself: seen from the telescope, it has a radius of ${shadow}.`,
      ]),
      ring: paragraphs([
        `Gravity works like a giant lens. A star behind the black hole shows up twice, one image on each side. ` +
          `When the star, the black hole and the telescope are perfectly lined up, the light arrives from every side ` +
          `at once and becomes a ring of light: the Einstein ring, here ${ring} in radius.`,
        `Einstein predicted it in 1936 and thought it would never be seen. Today telescopes photograph Einstein ` +
          `rings made by whole galaxies!`,
      ]),
      disk: paragraphs([
        `Gas that falls toward a black hole spins around it and heats up a lot, forming a glowing disk. Because of ` +
          `the curved light, you can see the back part of the disk too: it appears as an arch above (and below) the ` +
          `shadow.`,
        `One side of the disk shines more: there the gas is moving toward us at a good fraction of the speed of ` +
          `light, and its light arrives stronger and bluer. On the other side, weaker and redder.`,
      ]),
      real: paragraphs([
        `In 1919, during an eclipse, astronomers measured starlight bending around the Sun — the deflection ` +
          `Einstein had predicted. In 2019 the Event Horizon Telescope showed the first image of the shadow of a ` +
          `black hole, in the galaxy M87, and in 2022 the one at the centre of our own Milky Way.`,
      ]),
      scales: paragraphs([
        `The sphere shows a region ${region} in radius; the more mass, the bigger the black hole inside it. The ` +
          `sphere works like a window: only what is inside it is computed with the black hole's gravity.`,
        `Simplifications: the black hole does not spin (Schwarzschild); the observers hover at rest; the disk is ` +
          `thin, with the temperature profile of Shakura and Sunyaev. A real disk shines in X-rays: here its colours ` +
          `were scaled to visible light, and its rotation was slowed down a lot so you can follow it.`,
      ]),
    };
  }

  return {
    experiment: paragraphs([
      `Dentro da esfera de vidro há um buraco negro de ${mass} — e o que você vê nela é física de verdade: cada ` +
        `pixel é um raio de luz calculado no caminho da câmera, curvando em volta do buraco negro. Gire a vista em ` +
        `volta da bancada e você estará orbitando!`,
      `A tela da direita é um telescópio flutuando a ${distance} dele. Mova a estrela de fundo até ela ficar bem ` +
        `atrás do buraco negro e veja o que acontece.`,
    ]),
    shadow: paragraphs([
      `De dentro do horizonte, que aqui tem raio de ${horizon}, nada escapa — nem a luz. Um pouco mais longe, a ` +
        `${photon}, a luz consegue até andar em círculos: é a esfera de fótons, o anel dourado da visão didática.`,
      `A luz que passa mais perto que ${critical} é engolida. Por isso o buraco negro faz uma "sombra" maior do que ` +
        `ele mesmo: vista do telescópio, ela tem raio de ${shadow}.`,
    ]),
    ring: paragraphs([
      `A gravidade funciona como uma lente gigante. Uma estrela atrás do buraco negro aparece duas vezes, uma ` +
        `imagem de cada lado. Quando estrela, buraco negro e telescópio ficam perfeitamente alinhados, a luz chega ` +
        `por todos os lados ao mesmo tempo e vira um anel de luz: o anel de Einstein, aqui com ${ring} de raio.`,
      `Einstein previu isso em 1936 e achava que ninguém jamais veria. Hoje os telescópios fotografam anéis de ` +
        `Einstein feitos por galáxias inteiras!`,
    ]),
    disk: paragraphs([
      `O gás que cai num buraco negro gira em volta dele e esquenta muito, formando um disco brilhante. Por causa ` +
        `da luz curvada, dá para ver também a parte de trás do disco: ela aparece como um arco por cima (e por ` +
        `baixo) da sombra.`,
      `Um lado do disco brilha mais: ali o gás vem na nossa direção a uma boa fração da velocidade da luz, e a luz ` +
        `dele chega mais forte e mais azulada. Do outro lado, mais fraca e avermelhada.`,
    ]),
    real: paragraphs([
      `Em 1919, durante um eclipse — com observações também em Sobral, no Ceará —, astrônomos mediram a luz das ` +
        `estrelas desviando ao passar perto do Sol, como Einstein tinha previsto. Em 2019, o Event Horizon ` +
        `Telescope mostrou a primeira imagem da sombra de um buraco negro, na galáxia M87, e em 2022 a do centro da ` +
        `nossa Via Láctea.`,
    ]),
    scales: paragraphs([
      `A esfera mostra uma região de ${region} de raio; quanto mais massa, maior o buraco negro lá dentro. Ela ` +
        `funciona como uma janela: só o que está dentro dela é calculado com a gravidade do buraco negro.`,
      `Simplificações: o buraco negro não gira (Schwarzschild); os observadores ficam parados; o disco é fino, com ` +
        `o perfil de temperatura de Shakura e Sunyaev. Um disco de verdade brilha em raios X: aqui as cores foram ` +
        `trazidas para a luz visível, e a rotação ficou muito mais lenta para dar para acompanhar.`,
    ]),
  };
}
