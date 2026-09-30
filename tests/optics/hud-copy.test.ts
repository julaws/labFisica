import { describe, expect, it } from 'vitest';
import {
  formatCentimeters,
  formatDistance,
  formatFNumber,
  formatMillimeters,
} from '../../src/ui/i18n';
import { dofLimits } from '../../src/optics/thin-lens';
import { describeHighlights, describeState } from '../../src/experiments/lens-focus/describe';

const SUBJECTS = [
  { id: 'foreground', distanceMm: 370 },
  { id: 'midground', distanceMm: 600 },
  { id: 'background', distanceMm: 2000 },
] as const;

const base = { focalLength: 50, coc: 0.036 };

describe('formatação da interface (SPEC §6.7)', () => {
  it('usa vírgula decimal e 1 casa para centímetros', () => {
    expect(formatCentimeters(19.01, 'pt-BR')).toBe('1,9 cm');
    expect(formatCentimeters(600, 'pt-BR')).toBe('60,0 cm');
  });

  it('usa 2 a 3 casas para milímetros', () => {
    expect(formatMillimeters(1.413, 'pt-BR')).toBe('1,41 mm');
    expect(formatMillimeters(0.177, 'pt-BR')).toBe('0,177 mm');
  });

  it('grava o número f como nas objetivas', () => {
    expect(formatFNumber(2, 'pt-BR')).toBe('f/2');
    expect(formatFNumber(5.6, 'pt-BR')).toBe('f/5,6');
    expect(formatFNumber(16, 'pt-BR')).toBe('f/16');
    expect(formatFNumber(5.6, 'en')).toBe('f/5.6');
  });

  it('escolhe a unidade da distância de foco e mostra o infinito', () => {
    expect(formatDistance(600, 'pt-BR')).toBe('60,0 cm');
    expect(formatDistance(2000, 'pt-BR')).toBe('2,00 m');
    expect(formatDistance(Infinity, 'pt-BR')).toBe('∞');
  });
});

describe('critério 2 da SPEC §10: a zona nítida no HUD', () => {
  it('mostra 1,9 cm com foco em 60 cm, f/2 e c = 0,036', () => {
    const { total } = dofLimits(50, 2, 0.036, 600);
    expect(formatCentimeters(total, 'pt-BR')).toBe('1,9 cm');
  });

  it('mostra 0,7 cm com foco em 37 cm', () => {
    const { total } = dofLimits(50, 2, 0.036, 370);
    expect(formatCentimeters(total, 'pt-BR')).toBe('0,7 cm');
  });
});

describe('frase dinâmica do HUD', () => {
  it('reproduz o exemplo da SPEC com foco no pinheiro', () => {
    const sentence = describeState({ ...base, fNumber: 2, focusDistance: 370 }, SUBJECTS, 'pt-BR');
    expect(sentence).toBe(
      'Só o pinheiro está no plano: seus raios se encontram num ponto sobre o vidro. ' +
        'A cabana e o pico chegam como discos e ficam borrados. Zona nítida: 0,7 cm.',
    );
  });

  it('reproduz o exemplo da SPEC em f/16, com os 15,5 cm de zona nítida', () => {
    const sentence = describeState({ ...base, fNumber: 16, focusDistance: 600 }, SUBJECTS, 'pt-BR');
    expect(sentence.startsWith(
      'Em f/16 o cone de luz afina, todos os discos encolhem e a zona nítida cresce para 15,5 cm.',
    )).toBe(true);
  });

  it('concorda em gênero quando sobra um único objeto borrado', () => {
    const sentence = describeState({ ...base, fNumber: 2, focusDistance: 600 }, SUBJECTS, 'pt-BR');
    expect(sentence).toContain('Só a cabana está no plano');
    expect(sentence).toContain('O pinheiro e o pico chegam como discos');
  });

  it('com foco no infinito, não chama de nítido o que a física diz estar borrado', () => {
    const sentence = describeState(
      { ...base, fNumber: 2, focusDistance: Infinity },
      SUBJECTS,
      'pt-BR',
    );
    // O pinheiro vira o disco de 3,4 mm da SPEC — mas o pico não fica nítido:
    // a zona nítida só começa na hiperfocal, 34,8 m.
    expect(sentence).toContain('3,38 mm');
    expect(sentence).not.toContain('fica nítido');
    expect(sentence).toContain('Foco no infinito');
  });

  it('fala em inglês quando o idioma é inglês', () => {
    const sentence = describeState({ ...base, fNumber: 2, focusDistance: 370 }, SUBJECTS, 'en');
    expect(sentence.startsWith('Only the pine is on the plane')).toBe(true);
    expect(sentence).toContain('Sharp zone: 0.7 cm.');
  });
});

describe('destaques da frase do HUD', () => {
  it('só destaca trechos que a frase realmente contém', () => {
    for (const locale of ['pt-BR', 'en'] as const) {
      const state = { ...base, fNumber: 2, focusDistance: 600 };
      const sentence = describeState(state, SUBJECTS, locale).toLowerCase();
      const highlights = describeHighlights(state, locale);
      // Os três objetos aparecem na frase "só a cabana…".
      for (const noun of highlights.filter((item) => item.tone !== 'strong')) {
        expect(sentence).toContain(noun.text.toLowerCase());
      }
      // E a zona nítida em negrito é o mesmo número do chip.
      expect(highlights).toContainEqual({ text: locale === 'en' ? '1.9 cm' : '1,9 cm', tone: 'strong' });
    }
  });

  it('pinta cada objeto com a cor do seu leque de raios', () => {
    const tones = Object.fromEntries(
      describeHighlights({ ...base, fNumber: 2, focusDistance: 600 }, 'pt-BR').map((item) => [
        item.text,
        item.tone,
      ]),
    );
    expect(tones).toMatchObject({ pinheiro: 'focus', cabana: 'warm', pico: 'cool' });
  });
});
