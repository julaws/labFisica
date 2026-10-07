import type { ExperimentCopy, HudHighlight, Locale } from '../../core/experiment';
import { formatNumber } from '../../ui/i18n';

/**
 * Textos do foguete, em pt-BR e inglês (ADR 0020). Os números chegam
 * calculados pelo motor em `RocketFacts`.
 */

export type ChallengeVerdict = 'none' | 'orbit' | 'short' | 'fragile' | 'crushed' | 'heavy' | 'grounded';

export interface RocketFacts {
  readonly stages: number;
  readonly liftoffMass: number;
  readonly exhaust: number;
  /** Δv ideal (Tsiolkovsky, soma dos estágios), m/s. */
  readonly idealDeltaV: number;
  /** Razão de massas total m₀/m_f (do foguete inteiro sem a parte seca do topo). */
  readonly massRatio: number;
  /** No fim das queimas: velocidade, perdas, altitude. */
  readonly burnoutVelocity: number;
  readonly gravityLoss: number;
  readonly dragLoss: number;
  readonly burnoutAltitude: number;
  /** Agora (durante o voo): velocidade, altitude, aceleração (m/s²), empuxo (N), massa (kg), tempo (s). */
  readonly velocity: number;
  readonly altitude: number;
  readonly acceleration: number;
  readonly thrust: number;
  readonly mass: number;
  readonly time: number;
  readonly maxGs: number;
  readonly thrustToWeight: number;
  readonly gravity: boolean;
  readonly drag: boolean;
  readonly flying: boolean;
  readonly done: boolean;
  readonly challenge: boolean;
  readonly verdict: ChallengeVerdict;
  /** Eficiência: carga útil / massa no lançamento. */
  readonly efficiency: number;
  readonly stars: number;
}

export const formatKmS = (ms: number, locale: Locale): string => `${formatNumber(ms / 1000, 2, locale)} km/s`;
export const formatTons = (kg: number, locale: Locale): string =>
  `${formatNumber(kg / 1000, kg >= 100_000 ? 0 : 1, locale)} t`;
export const formatAltitude = (m: number, locale: Locale): string =>
  m >= 1000 ? `${formatNumber(m / 1000, m >= 100_000 ? 0 : 1, locale)} km` : `${formatNumber(m, 0, locale)} m`;

export function describeRocket(f: RocketFacts, locale: Locale): { sentence: string; highlights: HudHighlight[] } {
  const en = locale === 'en';
  const ideal = formatKmS(f.idealDeltaV, locale);
  const burnout = formatKmS(f.burnoutVelocity, locale);
  if (f.verdict === 'grounded') {
    return {
      sentence: en
        ? `The thrust (${formatNumber(f.thrust / 1000, 0, locale)} kN) is smaller than the weight: the rocket does not ` +
          `leave the pad. Increase the mass flow or lighten the rocket.`
        : `O empuxo (${formatNumber(f.thrust / 1000, 0, locale)} kN) é menor que o peso: o foguete não sai da ` +
          `plataforma. Aumente a vazão ou deixe o foguete mais leve.`,
      highlights: [{ text: en ? 'does not leave the pad' : 'não sai da plataforma', tone: 'warm' }],
    };
  }
  if (f.challenge && f.done) {
    const verdicts: Record<ChallengeVerdict, [string, string]> = {
      orbit: [
        `Orbit! ${burnout} with ${formatNumber(f.efficiency * 100, 2, locale)}% of the launch mass as payload: ${'★'.repeat(f.stars)}`,
        `Órbita! ${burnout} com ${formatNumber(f.efficiency * 100, 2, locale)}% da massa de lançamento em carga: ${'★'.repeat(f.stars)}`,
      ],
      short: [
        `It reached ${burnout}: short of the 7.8 km/s of orbit. Gravity took ${formatKmS(f.gravityLoss, locale)}.`,
        `Chegou a ${burnout}: faltou para os 7,8 km/s da órbita. A gravidade levou ${formatKmS(f.gravityLoss, locale)}.`,
      ],
      fragile: [
        `The structure is too light: the tanks need at least 8% of the propellant's mass.`,
        `A estrutura está leve demais: os tanques precisam de pelo menos 8% da massa do propelente.`,
      ],
      crushed: [
        `The acceleration reached ${formatNumber(f.maxGs, 1, locale)} g: the payload does not survive more than 6 g. Lower the mass flow.`,
        `A aceleração chegou a ${formatNumber(f.maxGs, 1, locale)} g: a carga não aguenta mais que 6 g. Diminua a vazão.`,
      ],
      heavy: [`Over the budget: the launch mass is limited to 600 t.`, `Passou do orçamento: a massa de lançamento é de no máximo 600 t.`],
      grounded: ['', ''],
      none: ['', ''],
    };
    const [textEn, textPt] = verdicts[f.verdict];
    return {
      sentence: en ? textEn : textPt,
      highlights: [{ text: f.verdict === 'orbit' ? (en ? 'Orbit!' : 'Órbita!') : burnout, tone: f.verdict === 'orbit' ? 'focus' : 'warm' }],
    };
  }
  if (!f.gravity && !f.drag) {
    return {
      sentence: en
        ? `No gravity and no air: the rocket gains exactly what Tsiolkovsky predicts, ${ideal}. The momentum the ` +
          `rocket gains is the momentum the gas carries the other way.`
        : `Sem gravidade e sem ar: o foguete ganha exatamente o que Tsiolkovsky prevê, ${ideal}. O momento que o ` +
          `foguete ganha é o que o gás leva para o outro lado.`,
      highlights: [{ text: ideal, tone: 'strong' }],
    };
  }
  return {
    sentence: en
      ? `Tsiolkovsky promises ${ideal}, but gravity (${formatKmS(f.gravityLoss, locale)}) and air ` +
        `(${formatKmS(f.dragLoss, locale)}) take their share: at the end of the burns, ${burnout}.`
      : `Tsiolkovsky promete ${ideal}, mas a gravidade (${formatKmS(f.gravityLoss, locale)}) e o ar ` +
        `(${formatKmS(f.dragLoss, locale)}) cobram a parte deles: no fim das queimas, ${burnout}.`,
    highlights: [
      { text: ideal, tone: 'strong' },
      { text: burnout, tone: 'focus' },
    ],
  };
}

export const ROCKET_SHORTCUTS = [
  { keys: 'L', description: { 'pt-BR': 'lançar', en: 'launch' } },
  { keys: 'K', description: { 'pt-BR': 'voltar à plataforma', en: 'back to the pad' } },
  { keys: '1 2 3', description: { 'pt-BR': 'número de estágios', en: 'number of stages' } },
  { keys: 'G', description: { 'pt-BR': 'gravidade', en: 'gravity' } },
  { keys: 'H', description: { 'pt-BR': 'arrasto do ar', en: 'air drag' } },
  { keys: '[ ]', description: { 'pt-BR': 'menos ou mais propelente', en: 'less or more propellant' } },
  { keys: 'V', description: { 'pt-BR': 'assistir ao vídeo explicativo', en: 'watch the explainer video' } },
] as const;

export function buildRocketCopy(f: RocketFacts): ExperimentCopy {
  const pt = sections(f, 'pt-BR');
  const en = sections(f, 'en');
  const section = (id: string, headingPt: string, headingEn: string) => ({
    id,
    heading: { 'pt-BR': headingPt, en: headingEn },
    body: { 'pt-BR': pt[id]!, en: en[id]! },
  });
  return {
    title: { 'pt-BR': 'O foguete', en: 'The rocket' },
    subtitle: {
      'pt-BR':
        'Um foguete empurra gás para baixo e o gás empurra o foguete para cima. Monte o seu, lance e veja para onde vai cada pedacinho de momento. Consegue chegar à órbita?',
      en: 'A rocket pushes gas down and the gas pushes the rocket up. Build yours, launch it and watch where every bit of momentum goes. Can you reach orbit?',
    },
    shortcuts: ROCKET_SHORTCUTS,
    sections: [
      section('experiment', 'O experimento', 'The experiment'),
      section('momentum', 'Empurrar para trás para ir para a frente', 'Push back to go forward'),
      section('log', 'A equação de Tsiolkovsky', "Tsiolkovsky's equation"),
      section('losses', 'Gravidade, ar e estágios', 'Gravity, air and stages'),
      section('challenge', 'O desafio', 'The challenge'),
      section('scales', 'Sobre o modelo', 'About the model'),
    ],
  };
}

function sections(f: RocketFacts, locale: Locale): Record<string, string> {
  const paragraphs = (list: readonly string[]): string => list.join('\n\n');
  const ve = formatKmS(f.exhaust, locale);
  const ideal = formatKmS(f.idealDeltaV, locale);
  if (locale === 'en') {
    return {
      experiment: paragraphs([
        `Choose how much propellant and structure your rocket has, how fast the gas comes out (the specific ` +
          `impulse) and how much gas per second the engine burns. Then press "Launch". The window behind the rocket ` +
          `shows the sky getting dark and the Earth curving below; the screens show momentum, velocity, mass and ` +
          `Tsiolkovsky's curve.`,
      ]),
      momentum: paragraphs([
        `Stand on a skateboard and throw a heavy ball forward: you roll backwards. A rocket does the same, but ` +
          `throws gas, very fast, all the time. Everything the rocket gains going up, the gas carries going down: ` +
          `look at the momentum screen — the bars always add up to zero.`,
        `Notice: the rocket does not push against the air or the ground. It works even better in space!`,
      ]),
      log: paragraphs([
        `The speed a rocket gains depends on two things: how fast the gas leaves (now ${ve}) and how much lighter ` +
          `the rocket gets as it burns. But there is a catch: to double the speed, you do not need double the ` +
          `fuel — you need to square the mass ratio. That is why rockets are almost all fuel.`,
        `With this rocket, without gravity or air, the gain would be ${ideal}.`,
      ]),
      losses: paragraphs([
        `Down here, gravity pulls the rocket down the whole time the engine is burning, and the air brakes it at ` +
          `the beginning. Turn them off and on to compare.`,
        `Stages are the great trick: when a tank empties, it is dropped, and the rocket stops carrying dead ` +
          `weight. Try 1, 2 and 3 stages with the same mass!`,
      ]),
      challenge: paragraphs([
        `Put a 1 t satellite at 7.8 km/s, the speed of a low orbit, with gravity and air turned on. Rules: at most ` +
          `600 t at launch, structure of at least 8% of the propellant and at most 6 g of acceleration. The lighter ` +
          `the rocket, the more stars.`,
      ]),
      scales: paragraphs([
        `Simplified model: the flight is vertical, in a straight line. Real rockets tilt little by little toward ` +
          `the horizontal (and so lose less to gravity); here only the speed counts toward "orbit". Exponential ` +
          `atmosphere, gravity weakening with altitude, constant thrust in each stage. Time runs faster: a few ` +
          `seconds here are minutes of real flight. The rocket and the exhaust are drawn small; the jet length shows ` +
          `the exhaust speed.`,
      ]),
    };
  }
  return {
    experiment: paragraphs([
      `Escolha quanto propelente e quanta estrutura o seu foguete tem, com que velocidade o gás sai (o impulso ` +
        `específico) e quanto gás por segundo o motor queima. Depois, aperte "Lançar". A janela atrás do foguete ` +
        `mostra o céu escurecendo e a Terra se curvando lá embaixo; as telas mostram o momento, a velocidade, a ` +
        `massa e a curva de Tsiolkovsky.`,
    ]),
    momentum: paragraphs([
      `Suba num skate e jogue uma bola pesada para a frente: você vai para trás. O foguete faz o mesmo, só que ` +
        `joga gás, muito rápido, o tempo todo. Tudo o que o foguete ganha subindo, o gás leva descendo: repare na ` +
        `tela do momento — as barras sempre somam zero.`,
      `Repare: o foguete não empurra o ar nem o chão. Ele funciona até melhor no espaço!`,
    ]),
    log: paragraphs([
      `A velocidade que um foguete ganha depende de duas coisas: da velocidade com que o gás sai (agora ${ve}) e ` +
        `de quanto o foguete fica mais leve queimando. Mas tem uma pegadinha: para dobrar a velocidade, não basta ` +
        `dobrar o combustível — é preciso elevar ao quadrado a razão de massas. Por isso foguetes são quase só ` +
        `combustível.`,
      `Com este foguete, sem gravidade nem ar, o ganho seria de ${ideal}.`,
    ]),
    losses: paragraphs([
      `Aqui embaixo, a gravidade puxa o foguete para baixo durante toda a queima, e o ar o freia no começo. ` +
        `Desligue e ligue as duas para comparar.`,
      `Os estágios são o grande truque: quando um tanque esvazia, ele é solto, e o foguete para de carregar peso ` +
        `morto. Experimente 1, 2 e 3 estágios com a mesma massa!`,
    ]),
    challenge: paragraphs([
      `Ponha um satélite de 1 t a 7,8 km/s, a velocidade de uma órbita baixa, com gravidade e ar ligados. Regras: ` +
        `no máximo 600 t no lançamento, estrutura de pelo menos 8% do propelente e no máximo 6 g de aceleração. ` +
        `Quanto mais leve o foguete, mais estrelas.`,
    ]),
    scales: paragraphs([
      `Modelo simplificado: o voo é vertical, em linha reta. Foguetes de verdade inclinam aos poucos para a ` +
        `horizontal (e assim perdem menos para a gravidade); aqui só a velocidade conta para a "órbita". Atmosfera ` +
        `exponencial, gravidade enfraquecendo com a altitude, empuxo constante em cada estágio. O tempo corre mais ` +
        `rápido: alguns segundos aqui são minutos de voo. O foguete e o jato estão desenhados pequenos; o ` +
        `comprimento do jato mostra a velocidade do gás.`,
    ]),
  };
}
