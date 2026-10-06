import type { ExperimentCopy, HudHighlight, Locale } from '../../core/experiment';
import { formatNumber } from '../../ui/i18n';

/**
 * Textos do experimento da força magnética, em pt-BR e inglês (ADR 0010).
 * Todo número chega calculado pelo motor em `MagneticFacts`.
 */

export type TrajectoryMode = 'straight-no-field' | 'straight-parallel' | 'circle' | 'helix';

export interface MagneticFacts {
  readonly mode: TrajectoryMode;
  /** Campo, T; corrente nas bobinas, A. */
  readonly field: number;
  readonly current: number;
  /** Giro das bobinas e ângulo entre feixe e campo, graus. */
  readonly coilAngle: number;
  readonly pitchAngle: number;
  readonly voltage: number;
  readonly spread: boolean;
  /** Elétron mais rápido do feixe: velocidade, m/s, e fração de c. */
  readonly speed: number;
  readonly beta: number;
  /** Raios (componente perpendicular) do mais rápido e do mais lento, m. */
  readonly radiusMax: number;
  readonly radiusMin: number;
  /** Passo da hélice do mais rápido, m; período de uma volta, s. */
  readonly pitch: number;
  readonly period: number;
  /** Raio da câmara, m. */
  readonly chamberRadius: number;
}

export const formatField = (tesla: number, locale: Locale): string => `${formatNumber(tesla * 1e3, 2, locale)} mT`;
export const formatCm = (meters: number, locale: Locale): string =>
  Number.isFinite(meters) ? `${formatNumber(meters * 100, 1, locale)} cm` : '∞';
export const formatSpeed = (speed: number, locale: Locale): string =>
  Number.isFinite(speed) ? `${formatNumber(speed / 1e6, 2, locale)} × 10⁶ m/s` : '∞';

export function modeLabel(mode: TrajectoryMode, locale: Locale): string {
  const en = locale === 'en';
  switch (mode) {
    case 'circle':
      return en ? 'Circle' : 'Círculo';
    case 'helix':
      return en ? 'Helix' : 'Hélice';
    default:
      return en ? 'Straight' : 'Reta';
  }
}

export function describeMagnetic(facts: MagneticFacts, locale: Locale): { sentence: string; highlights: HudHighlight[] } {
  const en = locale === 'en';
  const r = formatCm(facts.radiusMax, locale);
  const rMin = formatCm(facts.radiusMin, locale);
  const pitch = formatCm(facts.pitch, locale);
  const theta = `${formatNumber(facts.pitchAngle, 0, locale)}°`;
  const parts: string[] = [];
  const highlights: HudHighlight[] = [];

  switch (facts.mode) {
    case 'straight-no-field':
      parts.push(
        en
          ? 'No field, no force: the electrons fly straight to the glass.'
          : 'Sem campo, nada empurra os elétrons: eles seguem retos até o vidro.',
      );
      break;
    case 'straight-parallel':
      parts.push(
        en
          ? 'Field parallel to the beam: v × B = 0, so there is no force and the beam goes straight.'
          : 'Campo paralelo ao feixe: v × B = 0, não há força e o feixe segue reto.',
      );
      highlights.push({ text: 'v × B = 0', tone: 'strong' });
      break;
    case 'circle':
      parts.push(
        en
          ? `The field is perpendicular to the beam: the force q·v × B always points sideways, and the electron turns in a circle of ${r}.`
          : `O campo é perpendicular ao feixe: a força q·v × B aponta sempre para o lado, e o elétron gira num círculo de ${r}.`,
      );
      highlights.push({ text: r, tone: 'strong' });
      if (facts.radiusMax > facts.chamberRadius * 0.75) {
        parts.push(en ? 'Too wide for the chamber: it hits the glass.' : 'Largo demais para a câmara: ele bate no vidro.');
      }
      break;
    default:
      parts.push(
        en
          ? `The field makes ${theta} with the beam: the perpendicular part of the velocity turns (r = ${r}), the parallel part moves on — a helix with a ${pitch} pitch.`
          : `O campo faz ${theta} com o feixe: a parte da velocidade perpendicular a ele gira (r = ${r}), a paralela segue em frente — uma hélice de passo ${pitch}.`,
      );
      highlights.push({ text: en ? 'a helix' : 'uma hélice', tone: 'strong' });
  }

  if (facts.spread && facts.mode !== 'straight-no-field' && facts.mode !== 'straight-parallel') {
    parts.push(
      en
        ? `Slower electrons turn tighter (red, ${rMin}), faster ones wider (blue).`
        : `Os mais lentos fazem voltas menores (vermelho, ${rMin}), os mais rápidos, maiores (azul).`,
    );
  }
  return { sentence: parts.join(' '), highlights };
}

export const MAGNETIC_SHORTCUTS = [
  { keys: '[ ]', description: { 'pt-BR': 'diminuir ou aumentar o campo', en: 'weaker or stronger field' } },
  { keys: ', .', description: { 'pt-BR': 'girar as bobinas', en: 'rotate the coils' } },
  { keys: '1 2 3 4', description: { 'pt-BR': 'bobinas a 0°, 20°, 90° e 180°', en: 'coils at 0°, 20°, 90° and 180°' } },
  { keys: 'M', description: { 'pt-BR': 'energia espalhada ou única', en: 'spread or single energy' } },
] as const;

export function buildMagneticCopy(facts: MagneticFacts): ExperimentCopy {
  const pt = sections(facts, 'pt-BR');
  const en = sections(facts, 'en');
  const section = (id: string, headingPt: string, headingEn: string) => ({
    id,
    heading: { 'pt-BR': headingPt, en: headingEn },
    body: { 'pt-BR': pt[id]!, en: en[id]! },
  });
  return {
    title: { 'pt-BR': 'A força magnética', en: 'The magnetic force' },
    subtitle: {
      'pt-BR':
        'Um feixe de elétrons entra num campo magnético uniforme. Mude a força e a direção do campo e veja os elétrons desenharem círculos, hélices e arcos.',
      en: 'An electron beam enters a uniform magnetic field. Change the strength and direction of the field and watch the electrons draw circles, helices and arcs.',
    },
    shortcuts: MAGNETIC_SHORTCUTS,
    sections: [
      section('experiment', 'O experimento', 'The experiment'),
      section('force', 'Um empurrão de lado', 'A sideways push'),
      section('helix', 'Girando as bobinas', 'Rotating the coils'),
      section('scales', 'Sobre os tamanhos e as cores', 'About the sizes and the colours'),
    ],
  };
}

function sections(f: MagneticFacts, locale: Locale): Record<string, string> {
  const n = (value: number, decimals: number): string => formatNumber(value, decimals, locale);
  const beta = `${n(f.beta * 100, 0)}%`;
  const r = formatCm(f.radiusMax, locale);
  const straight = f.mode === 'straight-no-field' || f.mode === 'straight-parallel';
  const paragraphs = (list: readonly string[]): string => list.join('\n\n');

  if (locale === 'en') {
    return {
      experiment: paragraphs([
        `A cannon launches really fast electrons — the fastest reach ${beta} of the speed of light! They enter a ` +
          `glass ball placed between two big coils, rings of wire carrying electric current. That current creates ` +
          `a magnetic field in the middle of the ball, like an invisible magnet.`,
        `And how can we see where the electrons go? The ball holds a little gas: wherever an electron passes, the ` +
          `gas glows and leaves a luminous trail, like the white trail of a plane in the sky.`,
      ]),
      force: paragraphs([
        `The invisible magnet pushes the electron in a curious way: always sideways, never forwards or backwards. ` +
          `It does not speed the electron up or slow it down, it only bends its path. And what does a push that is ` +
          `always sideways do? It makes the electron go round in a circle, like a ball on a string that you swing ` +
          `in the air!`,
        straight
          ? `Right now there is no sideways push (the field is off, or pointing along the beam), so the electrons ` +
            `fly straight. Turn the field up and watch them curve.`
          : `Right now it is ${r} from the centre of the circle to its edge. Play with the controls: a stronger field makes ` +
            `the circle tighter; faster electrons make wider circles. And a fun fact: big or small, every circle ` +
            `takes the same time to go all the way round.`,
      ]),
      helix: paragraphs([
        `When you rotate the coils, the invisible magnet rotates with them. With the field across the beam, the ` +
          `electron makes a circle. Tilt it a little and the circle starts sliding forwards, turning into a spring, ` +
          `a helix! With the field pointing along the beam, the push disappears and the electron goes straight. ` +
          `Turn everything the other way round and the circle spins in the opposite direction.`,
        `It is the same effect that traps particles from the Sun in the Earth's magnetic field and makes them ` +
          `spiral down towards the poles, creating the auroras!`,
      ]),
      scales: paragraphs([
        `Almost everything here is life size: coils 30 cm in radius, a ball ${n(f.chamberRadius * 200, 0)} cm ` +
          `across, real fields and voltages. Only three simplifications: the invisible magnet is taken as the ` +
          `same everywhere inside the ball and zero outside it; the tube the beam comes out of is shielded from ` +
          `the field; and the little dots move much slower than real electrons — otherwise you would not see them.`,
        `In this cannon the electrons leave with slightly different speeds, so you can compare them side by side. ` +
          `Electrons have no colour: here the colour shows the speed — red for the slowest, blue for the fastest.`,
      ]),
    };
  }

  return {
    experiment: paragraphs([
      `Um canhão lança elétrons muito rápidos — os mais velozes chegam a ${beta} da velocidade da luz! Eles entram ` +
        `numa bola de vidro colocada entre duas bobinas grandes, que são anéis de fio por onde passa corrente ` +
        `elétrica. Essa corrente cria um campo magnético no meio da bola, como um ímã invisível.`,
      `E como dá para ver o caminho dos elétrons? A bola tem um pouquinho de gás: por onde o elétron passa, o gás ` +
        `brilha e deixa um rastro luminoso, como o rastro branco de um avião no céu.`,
    ]),
    force: paragraphs([
      `O ímã invisível empurra o elétron de um jeito curioso: sempre de lado, nunca para a frente nem para trás. ` +
        `Ele não acelera nem freia o elétron, só entorta o caminho. E um empurrão que é sempre de lado faz o quê? ` +
        `Faz o elétron andar em círculo, como uma bolinha presa num barbante que você gira no ar!`,
      straight
        ? `Agora não há empurrão de lado (o campo está desligado ou apontando ao longo do feixe), então os ` +
          `elétrons seguem retos. Aumente o campo e veja o caminho entortar.`
        : `Agora o círculo tem ${r} do centro até a borda. Brinque com os controles: campo mais forte deixa o ` +
          `círculo mais fechado; elétrons mais rápidos fazem círculos mais abertos. E uma curiosidade: grandes ou ` +
          `pequenos, todos os círculos levam o mesmo tempo para dar uma volta completa.`,
    ]),
    helix: paragraphs([
      `Quando você gira as bobinas, o ímã invisível gira junto. Com o campo atravessado em relação ao feixe, o ` +
        `elétron faz um círculo. Inclinando um pouco, o círculo começa a escorregar para a frente e vira uma mola, ` +
        `uma hélice! Com o campo apontando na mesma direção do feixe, o empurrão some e o elétron segue reto. E, ` +
        `virando tudo ao contrário, o círculo passa a girar para o outro lado.`,
      `É o mesmo efeito que prende as partículas que vêm do Sol no campo magnético da Terra e faz elas descerem ` +
        `em espiral até os polos, criando as auroras!`,
    ]),
    scales: paragraphs([
      `Aqui quase tudo está em tamanho real: bobinas de 30 cm de raio, bola de ${n(f.chamberRadius * 200, 0)} cm, ` +
        `campos e voltagens de verdade. Só três simplificações: o ímã invisível é considerado igual em todo o ` +
        `interior da bola e zero fora dela; o tubo de onde o feixe sai é protegido do campo; e os pontinhos andam ` +
        `bem mais devagar que os elétrons reais — senão você nem veria.`,
      `Neste canhão, os elétrons saem com velocidades um pouco diferentes, para você comparar lado a lado. ` +
        `Elétron não tem cor: aqui a cor mostra a velocidade — vermelho para os mais lentos, azul para os mais ` +
        `rápidos.`,
    ]),
  };
}
