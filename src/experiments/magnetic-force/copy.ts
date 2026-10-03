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
  readonly selector: boolean;
  readonly selectorVoltage: number;
  readonly selectorE: number;
  readonly selectorField: number;
  /** Velocidade que o seletor deixa passar, m/s, e a tensão equivalente, V. */
  readonly selectedSpeed: number;
  readonly selectedVoltage: number;
  /** O feixe tem elétrons com essa velocidade. */
  readonly selectedInBeam: boolean;
  /** Raio do elétron escolhido pelo seletor, m. */
  readonly selectedRadius: number;
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
  // Com o seletor, o círculo que sobra é o do elétron escolhido.
  const filtered = facts.selector && facts.selectedInBeam;
  const r = formatCm(filtered ? facts.selectedRadius : facts.radiusMax, locale);
  const rMin = formatCm(facts.radiusMin, locale);
  const pitch = formatCm(facts.pitch, locale);
  const theta = `${formatNumber(facts.pitchAngle, 0, locale)}°`;
  const parts: string[] = [];
  const highlights: HudHighlight[] = [];

  // Seletor ligado sem nenhum elétron na velocidade dele: nada chega à câmara.
  const blocked = facts.selector && !facts.selectedInBeam;
  switch (blocked ? 'blocked' : facts.mode) {
    case 'blocked':
      break;
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
      if ((filtered ? facts.selectedRadius : facts.radiusMax) > facts.chamberRadius * 0.75) {
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

  if (facts.selector) {
    const v = formatSpeed(facts.selectedSpeed, locale);
    if (facts.selectedInBeam) {
      parts.push(
        en
          ? `The velocity selector lets through only v = E/B = ${v}; the others hit its plates.`
          : `O seletor deixa passar só v = E/B = ${v}; os outros batem nas placas.`,
      );
    } else {
      parts.push(
        en
          ? `The selector picks v = ${v}, but no electron in the beam has that speed: all hit the plates.`
          : `O seletor escolhe v = ${v}, mas nenhum elétron do feixe tem essa velocidade: todos batem nas placas.`,
      );
    }
    highlights.push({ text: v, tone: 'focus' });
  } else if (facts.spread && facts.mode !== 'straight-no-field' && facts.mode !== 'straight-parallel') {
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
  { keys: 'V', description: { 'pt-BR': 'ligar ou desligar o seletor de velocidades', en: 'velocity selector on or off' } },
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
      section('force', 'A força de Lorentz', 'The Lorentz force'),
      section('helix', 'Girando as bobinas', 'Rotating the coils'),
      section('selector', 'O seletor de velocidades', 'The velocity selector'),
      section('scales', 'Sobre as escalas e as cores', 'About the scales and the colours'),
    ],
  };
}

function sections(f: MagneticFacts, locale: Locale): Record<string, string> {
  const n = (value: number, decimals: number): string => formatNumber(value, decimals, locale);
  const B = formatField(f.field, locale);
  const I = `${n(f.current, 2)} A`;
  const U = `${n(f.voltage, 0)} V`;
  const v = formatSpeed(f.speed, locale);
  const beta = `${n(f.beta * 100, 1)}%`;
  const r = formatCm(f.radiusMax, locale);
  const T = `${n(f.period * 1e9, 1)} ns`;
  const Bs = formatField(f.selectorField, locale);

  if (locale === 'en') {
    return {
      experiment:
        `An electron gun accelerates electrons through ${U}; the fastest leave at ${v} (${beta} of the speed of ` +
        `light). The beam runs through a glass neck, crosses a velocity selector and enters a glass sphere ` +
        `between two Helmholtz coils. With ${I} in the coils, the field at the centre is ${B}.\n\n` +
        `The sphere holds a little low-pressure gas: where an electron passes, the gas glows. That is how the ` +
        `paths become visible, as in a fine-beam tube or the tracks of a bubble chamber.`,
      force:
        `A charge moving in a magnetic field feels F = q·v × B: perpendicular to both the velocity and the ` +
        `field. It never speeds the electron up or slows it down — it only bends the path. With the field ` +
        `perpendicular to the beam, the bending is the same at every point: a circle of radius r = m·v / (|q|·B), ` +
        `now ${r}. One turn takes ${T}, whatever the radius: faster electrons make bigger circles in the same time.\n\n` +
        `Stronger field, tighter circle; higher voltage, wider circle.`,
      helix:
        `The coils turn around the vertical axis, and the field turns with them. Only the part of the velocity ` +
        `perpendicular to B is bent; the part along B is untouched. At 0° the beam is perpendicular to the ` +
        `field (circle); at an angle the circle drifts along the field (helix); at 90° the beam is parallel ` +
        `to the field and goes straight; at 180° the field is reversed and the circle bends the other way.`,
      selector:
        `Before the sphere, two plates (electric field E) and two small coils (magnetic field ${Bs}) cross their ` +
        `fields. The electric force pulls the electron one way, the magnetic force the other way. They cancel ` +
        `only when v = E/B: those electrons go straight through the slit; faster or slower ones bend into the ` +
        `plates. With the selector on, a single circle is left.`,
      scales:
        `Everything is life size: coils of ${n(30, 0)} cm radius, a sphere of ${n(f.chamberRadius * 200, 0)} cm, ` +
        `real fields and voltages. Three simplifications: the field is taken as uniform inside the sphere and ` +
        `zero outside it; the tube the beam comes out of inside the sphere is shielded; and the moving dots go ` +
        `far slower than real electrons.\n\n` +
        `The gun in this experiment releases electrons with energies spread from 60% to 100% of eU, so the ` +
        `selector has something to filter (a real gun spreads by less than 1 eV; choose "single energy" to see ` +
        `it). Electrons have no colour: the colour shows the speed — red for the slowest, blue for the fastest.`,
    };
  }

  return {
    experiment:
      `Um canhão acelera elétrons com ${U}; os mais rápidos saem a ${v} (${beta} da velocidade da luz). O ` +
      `feixe corre por um gargalo de vidro, atravessa um seletor de velocidades e entra numa esfera de vidro ` +
      `entre duas bobinas de Helmholtz. Com ${I} nas bobinas, o campo no centro é de ${B}.\n\n` +
      `A esfera tem um pouco de gás a baixa pressão: por onde o elétron passa, o gás brilha. É assim que as ` +
      `trajetórias aparecem, como num tubo de feixe fino ou nos rastros de uma câmara de bolhas.`,
    force:
      `Uma carga em movimento num campo magnético sente F = q·v × B: perpendicular à velocidade e ao campo. ` +
      `Ela nunca acelera nem freia o elétron — só entorta o caminho. Com o campo perpendicular ao feixe, a ` +
      `curva é igual em todo ponto: um círculo de raio r = m·v / (|q|·B), agora ${r}. Uma volta leva ${T}, ` +
      `qualquer que seja o raio: os mais rápidos fazem círculos maiores no mesmo tempo.\n\n` +
      `Campo mais forte, círculo mais fechado; tensão maior, círculo mais aberto.`,
    helix:
      `As bobinas giram em torno do eixo vertical, e o campo gira com elas. Só a parte da velocidade ` +
      `perpendicular a B é entortada; a parte ao longo de B fica como está. A 0° o feixe é perpendicular ao ` +
      `campo (círculo); inclinado, o círculo escorrega ao longo do campo (hélice); a 90° o feixe é paralelo ao ` +
      `campo e segue reto; a 180° o campo se inverte e o círculo curva para o outro lado.`,
    selector:
      `Antes da esfera, duas placas (campo elétrico E) e duas bobinas pequenas (campo magnético de ${Bs}) ` +
      `cruzam seus campos. A força elétrica puxa o elétron para um lado, a magnética para o outro. Elas se ` +
      `cancelam só quando v = E/B: esses elétrons passam retos pela fenda; os mais rápidos ou mais lentos ` +
      `curvam para as placas. Com o seletor ligado, sobra um círculo só.`,
    scales:
      `Tudo está em tamanho real: bobinas de ${n(30, 0)} cm de raio, esfera de ${n(f.chamberRadius * 200, 0)} cm, ` +
      `campos e tensões reais. Três simplificações: o campo é tomado como uniforme dentro da esfera e nulo ` +
      `fora dela; o tubo de onde o feixe sai dentro da esfera é blindado; e os pontos que andam são muito mais ` +
      `lentos que os elétrons reais.\n\n` +
      `O canhão deste experimento solta elétrons com energias espalhadas de 60% a 100% de eU, para o seletor ` +
      `ter o que filtrar (um canhão real espalha menos de 1 eV; escolha "energia única" para ver). Elétron ` +
      `não tem cor: a cor mostra a velocidade — vermelho para os mais lentos, azul para os mais rápidos.`,
  };
}
