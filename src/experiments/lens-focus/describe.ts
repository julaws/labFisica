import { blurDiameter, dofLimits, plateBlurDiameter } from '../../optics/thin-lens';
import { type Locale, formatCentimeters, formatFNumber, formatMillimeters } from '../../ui/i18n';

/**
 * Frase dinâmica do HUD (SPEC §6.7), gerada a partir do estado.
 *
 * Todo número da frase sai do motor óptico; esta função só decide o que dizer
 * e como dizer. A regra é **dizer o que é verdade**: um objeto só é chamado de
 * nítido se a distância física dele cair dentro da zona nítida calculada.
 *
 * Isso diverge de um exemplo da própria SPEC ("Foco no infinito: o pico fica
 * nítido"). Com foco no infinito a zona nítida começa na hiperfocal — 34,8 m
 * em f/2 —, e o pico a 2 m chega ao sensor como um disco de 0,63 mm, dezessete
 * vezes o círculo admissível. A frase gerada diz isso.
 */

export interface DescribedSubject {
  readonly id: 'foreground' | 'midground' | 'background';
  readonly distanceMm: number;
}

export interface DescribeState {
  /** Distância focal, mm, com sinal: negativa numa lente divergente. */
  readonly focalLength: number;
  readonly fNumber: number;
  readonly focusDistance: number;
  readonly coc: number;
  /** Borrão de aberração esférica no melhor foco, mm (ADR 0007). */
  readonly aberrationSpot?: number;
  /** Distância de casa do sensor ao plano principal traseiro, mm. */
  readonly homePlate?: number;
}

/** Artigo e gênero de cada objeto, para a concordância do português. */
interface Noun {
  readonly the: string;
  readonly The: string;
  readonly feminine: boolean;
}

interface Grammar {
  readonly nouns: Record<DescribedSubject['id'], Noun>;
  readonly and: string;
  onlyOne(subject: Noun, others: Noun[], zone: string): string;
  several(subjects: Noun[], others: Noun[], zone: string): string;
  none(smallest: Noun, blur: string, zone: string): string;
  infinity(closest: Noun, closestBlur: string, farthest: Noun, farthestBlur: string): string;
  stoppedDown(fNumber: string, zone: string): string;
  /** Lente divergente: não forma imagem real. */
  diverging(smallest: Noun, blur: string): string;
  /** Lente simples aberta: a aberração esférica passa do círculo admissível. */
  aberration(spot: string, coc: string): string;
}

const PT: Grammar = {
  nouns: {
    foreground: { the: 'o pinheiro', The: 'O pinheiro', feminine: false },
    midground: { the: 'a cabana', The: 'A cabana', feminine: true },
    background: { the: 'o pico', The: 'O pico', feminine: false },
  },
  and: 'e',
  onlyOne(subject, others, zone) {
    const rest =
      others.length === 1
        ? `${others[0]!.The} chega como disco e fica ${others[0]!.feminine ? 'borrada' : 'borrado'}.`
        : `${capitalize(joinNouns(others, 'e'))} chegam como discos e ficam borrados.`;
    return (
      `Só ${subject.the} está no plano: seus raios se encontram num ponto sobre o vidro. ` +
      `${rest} Zona nítida: ${zone}.`
    );
  },
  several(subjects, others, zone) {
    const inside = `${capitalize(joinNouns(subjects, 'e'))} cabem dentro da zona nítida de ${zone}.`;
    if (others.length === 0) return `${inside} Nada no vale chega borrado ao vidro.`;
    const rest =
      others.length === 1
        ? `${others[0]!.The} fica de fora e chega como disco.`
        : `${capitalize(joinNouns(others, 'e'))} ficam de fora e chegam como discos.`;
    return `${inside} ${rest}`;
  },
  none(smallest, blur, zone) {
    return (
      `Nenhum objeto do vale está no plano de foco: todos chegam ao vidro como discos. ` +
      `O menor é o d${smallest.feminine ? 'a' : 'o'} ${smallest.the.slice(2)}, com ${blur}. ` +
      `Zona nítida: ${zone}.`
    );
  },
  infinity(closest, closestBlur, farthest, farthestBlur) {
    return (
      `Foco no infinito: a zona nítida começa longe, depois do vale inteiro. ` +
      `${closest.The} é o que chega mais perto de nítido, com um disco de ${closestBlur}, ` +
      `e ${farthest.the} vira um disco de ${farthestBlur} no sensor.`
    );
  },
  stoppedDown(fNumber, zone) {
    return `Em ${fNumber} o cone de luz afina, todos os discos encolhem e a zona nítida cresce para ${zone}.`;
  },
  diverging(smallest, blur) {
    return (
      `Lente divergente: os raios saem abrindo, como se viessem de um ponto à frente dela — a imagem virtual. ` +
      `Nada se forma no vidro: até ${smallest.the} chega como um disco de ${blur}, maior que o sensor.`
    );
  },
  aberration(spot, coc) {
    return (
      `Mas esta lente simples tem aberração esférica: mesmo no plano, um ponto vira um disco de ${spot}, ` +
      `maior que os ${coc} admissíveis. Feche o diafragma para a nitidez voltar.`
    );
  },
};

const EN: Grammar = {
  nouns: {
    foreground: { the: 'the pine', The: 'The pine', feminine: false },
    midground: { the: 'the cabin', The: 'The cabin', feminine: false },
    background: { the: 'the peak', The: 'The peak', feminine: false },
  },
  and: 'and',
  onlyOne(subject, others, zone) {
    const verb = others.length === 1 ? 'arrives as a disc and blurs' : 'arrive as discs and blur';
    return (
      `Only ${subject.the} is on the plane: its rays meet at a point on the glass. ` +
      `${capitalize(joinNouns(others, 'and'))} ${verb}. Sharp zone: ${zone}.`
    );
  },
  several(subjects, others, zone) {
    const inside = `${capitalize(joinNouns(subjects, 'and'))} fit inside the ${zone} sharp zone.`;
    if (others.length === 0) return `${inside} Nothing in the valley reaches the glass blurred.`;
    const verb = others.length === 1 ? 'falls outside and arrives as a disc' : 'fall outside and arrive as discs';
    return `${inside} ${capitalize(joinNouns(others, 'and'))} ${verb}.`;
  },
  none(smallest, blur, zone) {
    return (
      `Nothing in the valley is on the plane of focus: everything reaches the glass as a disc. ` +
      `The smallest is ${smallest.the}'s, at ${blur}. Sharp zone: ${zone}.`
    );
  },
  infinity(closest, closestBlur, farthest, farthestBlur) {
    return (
      `Focus at infinity: the sharp zone starts far away, past the whole valley. ` +
      `${closest.The} comes closest to sharp, with a ${closestBlur} disc, ` +
      `and ${farthest.the} becomes a ${farthestBlur} disc on the sensor.`
    );
  },
  stoppedDown(fNumber, zone) {
    return `At ${fNumber} the cone of light narrows, every disc shrinks and the sharp zone grows to ${zone}.`;
  },
  diverging(smallest, blur) {
    return (
      `Diverging lens: the rays leave it spreading out, as if they came from a point in front of it — the ` +
      `virtual image. Nothing forms on the glass: even ${smallest.the} arrives as a ${blur} disc, wider than the sensor.`
    );
  },
  aberration(spot, coc) {
    return (
      `But this simple lens has spherical aberration: even on the plane, a point becomes a ${spot} disc, ` +
      `larger than the acceptable ${coc}. Stop down and sharpness comes back.`
    );
  },
};

const GRAMMARS: Record<Locale, Grammar> = { 'pt-BR': PT, en: EN };

/** A partir de qual número f a frase fala do diafragma fechado. */
const STOPPED_DOWN_FROM = 11;

export function describeState(
  state: DescribeState,
  subjects: readonly DescribedSubject[],
  locale: Locale,
): string {
  const grammar = GRAMMARS[locale];
  const { focalLength: f, fNumber: N, coc } = state;

  // Lente divergente: não há plano de foco nem zona nítida, só discos.
  if (state.focalLength < 0) {
    const home = state.homePlate ?? Math.abs(f);
    const smallest = [...subjects]
      .map((subject) => ({ subject, blur: plateBlurDiameter(f, N, home, subject.distanceMm) }))
      .sort((a, b) => a.blur - b.blur)[0]!;
    return grammar.diverging(
      grammar.nouns[smallest.subject.id],
      formatMillimeters(smallest.blur, locale),
    );
  }

  const sentence = describeConverging(state, subjects, locale);
  const spot = state.aberrationSpot ?? 0;
  if (spot > coc) {
    return `${sentence} ${grammar.aberration(formatMillimeters(spot, locale), formatMillimeters(coc, locale))}`;
  }
  return sentence;
}

/** Frase de uma lente convergente (a de sempre). */
function describeConverging(
  state: DescribeState,
  subjects: readonly DescribedSubject[],
  locale: Locale,
): string {
  const grammar = GRAMMARS[locale];
  const { focalLength: f, fNumber: N, focusDistance: s, coc } = state;

  const dof = dofLimits(f, N, coc, s);
  const zone = formatCentimeters(dof.total, locale);

  const blurs = subjects.map((subject) => ({
    subject,
    blur: blurDiameter(f, N, s, subject.distanceMm),
    sharp: subject.distanceMm >= dof.near && subject.distanceMm <= dof.far,
  }));

  if (!Number.isFinite(s)) {
    const byBlur = [...blurs].sort((a, b) => a.blur - b.blur);
    const closest = byBlur[0]!;
    const farthest = byBlur.at(-1)!;
    return grammar.infinity(
      grammar.nouns[closest.subject.id],
      formatMillimeters(closest.blur, locale),
      grammar.nouns[farthest.subject.id],
      formatMillimeters(farthest.blur, locale),
    );
  }

  const sharp = blurs.filter((entry) => entry.sharp).map((entry) => grammar.nouns[entry.subject.id]);
  const blurred = blurs.filter((entry) => !entry.sharp).map((entry) => grammar.nouns[entry.subject.id]);

  let sentence: string;
  if (sharp.length === 1) {
    sentence = grammar.onlyOne(sharp[0]!, blurred, zone);
  } else if (sharp.length > 1) {
    sentence = grammar.several(sharp, blurred, zone);
  } else {
    const smallest = [...blurs].sort((a, b) => a.blur - b.blur)[0]!;
    sentence = grammar.none(
      grammar.nouns[smallest.subject.id],
      formatMillimeters(smallest.blur, locale),
      zone,
    );
  }

  // Diafragma bem fechado: o assunto passa a ser a abertura.
  if (N >= STOPPED_DOWN_FROM) {
    return `${grammar.stoppedDown(formatFNumber(N, locale), zone)} ${stripZone(sentence)}`;
  }

  return sentence;
}

/** "o pinheiro", "a cabana" → "o pinheiro e a cabana". */
function joinNouns(nouns: readonly Noun[], and: string): string {
  const names = nouns.map((noun) => noun.the);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} ${and} ${names.at(-1)!}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Tira o "Zona nítida: …" do fim, quando a frase do diafragma já o disse. */
function stripZone(sentence: string): string {
  return sentence.replace(/\s*(Zona nítida|Sharp zone): [^.]+\.$/, '');
}

/** Cor de cada objeto: a mesma do leque de raios dele (SPEC §6.5). */
const SUBJECT_TONES: Record<DescribedSubject['id'], 'focus' | 'warm' | 'cool'> = {
  foreground: 'focus',
  midground: 'warm',
  background: 'cool',
};

/**
 * Trechos da frase que o HUD destaca: o nome de cada objeto na cor do leque
 * dele, e em negrito a zona nítida e o "ponto" onde os raios se encontram.
 * Não calcula nada novo; só aponta palavras que `describeState` já escreveu.
 */
export function describeHighlights(
  state: DescribeState,
  locale: Locale,
): { text: string; tone: 'focus' | 'warm' | 'cool' | 'strong' }[] {
  const grammar = GRAMMARS[locale];
  const { focalLength: f, fNumber: N, focusDistance: s, coc } = state;
  const dof = dofLimits(f, N, coc, s);

  const nouns = (Object.keys(SUBJECT_TONES) as DescribedSubject['id'][]).map((id) => ({
    // Sem o artigo: "o pinheiro" e "O pinheiro" destacam só "pinheiro".
    text: grammar.nouns[id].the.replace(/^\S+\s/, ''),
    tone: SUBJECT_TONES[id],
  }));

  return [
    ...nouns,
    { text: formatCentimeters(dof.total, locale), tone: 'strong' },
    { text: locale === 'en' ? 'a point' : 'num ponto', tone: 'strong' },
    { text: formatFNumber(N, locale), tone: 'strong' },
  ];
}
