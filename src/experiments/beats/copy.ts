import type { ExperimentCopy, HudHighlight, Locale } from '../../core/experiment';
import type { Waveform } from '../../optics/acoustics/beats';
import { formatNumber } from '../../ui/i18n';

/**
 * Textos dos batimentos, em pt-BR e inglês (ADR 0019). Os números chegam
 * calculados pelo motor em `BeatsFacts`.
 */

export interface BeatsFacts {
  readonly f1: number;
  readonly f2: number;
  readonly waveform: Waveform;
  /** |f₁ − f₂|, Hz, e o período, s. */
  readonly beat: number;
  readonly period: number;
  /** O batimento entre harmônicos mais grave, quando as notas estão longe. */
  readonly harmonic: { readonly p: number; readonly q: number; readonly beat: number } | null;
  /** Nome do intervalo mais próximo e o desvio dele, em cents. */
  readonly interval: string;
  readonly cents: number;
  readonly sound: boolean;
}

export const formatHz = (hz: number, locale: Locale): string => `${formatNumber(hz, 2, locale)} Hz`;

export const formatPeriod = (seconds: number, locale: Locale): string =>
  Number.isFinite(seconds) ? `${formatNumber(seconds, seconds >= 10 ? 1 : 2, locale)} s` : '∞';

export function describeBeats(f: BeatsFacts, locale: Locale): { sentence: string; highlights: HudHighlight[] } {
  const en = locale === 'en';
  const beat = formatHz(f.beat, locale);
  if (f.beat === 0) {
    return {
      sentence: en
        ? `Perfect unison: the two waves add up without ever cancelling out. No beats — this is what tuners listen for.`
        : `Uníssono perfeito: as duas ondas se somam sem nunca se cancelar. Nenhum batimento — é isso que os afinadores procuram.`,
      highlights: [{ text: en ? 'No beats' : 'Nenhum batimento', tone: 'focus' }],
    };
  }
  if (f.beat < 30) {
    return {
      sentence: en
        ? `The notes differ by ${beat}: sometimes the waves push together, sometimes against each other, and the ` +
          `volume pulses ${formatNumber(f.beat, 2, locale)} times per second — one beat every ${formatPeriod(f.period, locale)}.`
        : `As notas diferem por ${beat}: ora as ondas empurram juntas, ora uma contra a outra, e o volume pulsa ` +
          `${formatNumber(f.beat, 2, locale)} vezes por segundo — uma batida a cada ${formatPeriod(f.period, locale)}.`,
      highlights: [{ text: beat, tone: 'strong' }],
    };
  }
  if (f.harmonic && f.harmonic.beat > 0.005) {
    const h = f.harmonic;
    const hb = formatHz(h.beat, locale);
    return {
      sentence: en
        ? `Interval: ${f.interval}. The fundamentals are far apart, but harmonic ${h.p} of f₁ and harmonic ${h.q} of ` +
          `f₂ are only ${hb} apart: that is the slow beat a trained ear hears.`
        : `Intervalo: ${f.interval}. As fundamentais estão longe, mas o harmônico ${h.p} de f₁ e o ${h.q} de f₂ ` +
          `diferem só ${hb}: é esse batimento lento que um ouvido treinado escuta.`,
      highlights: [{ text: hb, tone: 'warm' }],
    };
  }
  return {
    sentence: en
      ? `Interval: ${f.interval}. The notes are far apart and, with this timbre, no harmonics collide: no beats.`
      : `Intervalo: ${f.interval}. As notas estão longe e, com esse timbre, nenhum harmônico se encontra: sem batimento.`,
    highlights: [{ text: en ? 'no beats' : 'sem batimento', tone: 'focus' }],
  };
}

export const BEATS_SHORTCUTS = [
  { keys: '- =', description: { 'pt-BR': 'baixar ou subir f₁', en: 'lower or raise f₁' } },
  { keys: ', .', description: { 'pt-BR': 'desafinar f₂ (0,1 Hz)', en: 'detune f₂ (0.1 Hz)' } },
  { keys: '0', description: { 'pt-BR': 'zerar a desafinação', en: 'zero the detuning' } },
  { keys: 'T', description: { 'pt-BR': 'trocar a forma de onda', en: 'change the waveform' } },
  { keys: 'M', description: { 'pt-BR': 'ligar ou desligar o som', en: 'sound on or off' } },
  { keys: 'Z', description: { 'pt-BR': 'osciloscópio: batimento ou ondas', en: 'oscilloscope: beats or waves' } },
] as const;

export function buildBeatsCopy(f: BeatsFacts): ExperimentCopy {
  const pt = sections(f, 'pt-BR');
  const en = sections(f, 'en');
  const section = (id: string, headingPt: string, headingEn: string) => ({
    id,
    heading: { 'pt-BR': headingPt, en: headingEn },
    body: { 'pt-BR': pt[id]!, en: en[id]! },
  });
  return {
    title: { 'pt-BR': 'Batimentos', en: 'Beats' },
    subtitle: {
      'pt-BR':
        'Dois osciladores com notas quase iguais. Ligue o som e escute o volume pulsar: veja a soma no osciloscópio, as duas linhas no espectro e os vetores girando.',
      en: 'Two oscillators playing almost the same note. Turn on the sound and hear the volume pulse: see the sum on the oscilloscope, the two lines in the spectrum and the spinning arrows.',
    },
    shortcuts: BEATS_SHORTCUTS,
    sections: [
      section('experiment', 'O experimento', 'The experiment'),
      section('why', 'Por que o som pulsa', 'Why the sound pulses'),
      section('phasors', 'As setinhas que giram', 'The spinning arrows'),
      section('tuning', 'Afinando pelo ouvido', 'Tuning by ear'),
      section('scales', 'Sobre o som', 'About the sound'),
    ],
  };
}

function sections(f: BeatsFacts, locale: Locale): Record<string, string> {
  const paragraphs = (list: readonly string[]): string => list.join('\n\n');
  const beat = formatHz(f.beat, locale);
  if (locale === 'en') {
    return {
      experiment: paragraphs([
        `On the bench there is a small synthesizer with two oscillators: each one makes a note. Right now they are ` +
          `${formatHz(f.f1, locale)} and ${formatHz(f.f2, locale)}. Turn on the sound (it starts muted) and listen: ` +
          `instead of a steady note, a "wah-wah-wah" — the beats.`,
        `Detune the second oscillator little by little and count: the closer the notes, the slower the beat. Play ` +
          `the keys of the keyboard to hear real musical intervals.`,
      ]),
      why: paragraphs([
        `Sound is a wave of pressure. When two waves are in step, crest meets crest and the sound gets loud; a ` +
          `moment later, one has pulled ahead and crest meets trough: they cancel and the sound almost disappears. ` +
          `That back and forth happens exactly as many times per second as the difference between the two ` +
          `frequencies: now, ${beat}.`,
        `On the oscilloscope, the big green wave is the sum, and the golden dashed line is its "envelope", the ` +
          `volume going up and down.`,
      ]),
      phasors: paragraphs([
        `Each wave can be drawn as an arrow spinning in a circle: the shadow of its tip goes up and down like the ` +
          `wave. Seen while spinning along with the average note, the two arrows turn slowly in opposite ` +
          `directions. When they point the same way, the golden arrow (the sum) is long — loud sound; when they ` +
          `point opposite ways, it shrinks — silence.`,
      ]),
      tuning: paragraphs([
        `Guitarists tune by ear using beats: they play two strings that should give the same note and turn the peg ` +
          `until the "wah-wah" slows down and stops. Piano tuners even count beats per second!`,
        `Musical intervals beat too, between harmonics: in a fifth on the piano (tempered tuning), the third ` +
          `harmonic of the lower note and the second of the upper one differ by less than 1 Hz. Choose the ` +
          `sawtooth waveform and play the E on the keyboard to hear it.`,
      ]),
      scales: paragraphs([
        `The sound you hear is the real one, at the frequencies shown, through a volume limiter to protect your ` +
          `ears. As soon as you touch a control, the spectrum is measured live from the sound itself (Web Audio), ` +
          `even with the speaker muted; before that, the screen shows only the theoretical lines. Fast beats appear ` +
          `in slow motion on the arrows screen.`,
      ]),
    };
  }
  return {
    experiment: paragraphs([
      `Na bancada há um pequeno sintetizador com dois osciladores: cada um faz uma nota. Agora eles estão em ` +
        `${formatHz(f.f1, locale)} e ${formatHz(f.f2, locale)}. Ligue o som (ele começa mudo) e escute: em vez de ` +
        `uma nota firme, um "uá-uá-uá" — os batimentos.`,
      `Desafine o segundo oscilador aos pouquinhos e conte: quanto mais perto as notas, mais lento o batimento. ` +
        `Toque as teclas do teclado para ouvir intervalos musicais de verdade.`,
    ]),
    why: paragraphs([
      `O som é uma onda de pressão. Quando as duas ondas estão no mesmo passo, crista encontra crista e o som fica ` +
        `forte; um instante depois, uma se adiantou e crista encontra vale: elas se cancelam e o som quase some. ` +
        `Esse vai e vem acontece exatamente tantas vezes por segundo quanto a diferença entre as duas frequências: ` +
        `agora, ${beat}.`,
      `No osciloscópio, a onda verde grande é a soma, e a linha dourada tracejada é a "envoltória" dela, o volume ` +
        `subindo e descendo.`,
    ]),
    phasors: paragraphs([
      `Cada onda pode ser desenhada como uma setinha girando num círculo: a sombra da ponta sobe e desce como a ` +
        `onda. Vistas girando junto com a nota média, as duas setas giram devagar em sentidos opostos. Quando ` +
        `apontam para o mesmo lado, a seta dourada (a soma) fica comprida — som forte; quando apontam para lados ` +
        `opostos, ela encolhe — silêncio.`,
    ]),
    tuning: paragraphs([
      `Violonistas afinam de ouvido usando batimentos: tocam duas cordas que deveriam dar a mesma nota e giram a ` +
        `tarraxa até o "uá-uá" ficar lento e parar. Afinadores de piano chegam a contar batidas por segundo!`,
      `Intervalos musicais também batem, entre harmônicos: numa quinta do piano (afinação temperada), o terceiro ` +
        `harmônico da nota de baixo e o segundo da de cima diferem por menos de 1 Hz. Escolha a onda dente de ` +
        `serra e toque o mi no teclado para ouvir.`,
    ]),
    scales: paragraphs([
      `O som que você ouve é o de verdade, nas frequências mostradas, passando por um limitador de volume para ` +
        `proteger os ouvidos. Assim que você mexe num controle, o espectro passa a ser medido ao vivo no próprio som ` +
        `(Web Audio), mesmo com o alto-falante mudo; antes disso, a tela mostra só as linhas teóricas. Batimentos ` +
        `rápidos aparecem em câmera lenta na tela das setinhas.`,
    ]),
  };
}
