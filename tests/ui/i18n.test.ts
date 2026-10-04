import { describe, expect, it } from 'vitest';
import { browserLocale } from '../../src/ui/i18n';

describe('idioma inicial pelo navegador', () => {
  it('português em qualquer variante', () => {
    expect(browserLocale(['pt-BR', 'en-US'])).toBe('pt-BR');
    expect(browserLocale(['pt-PT'])).toBe('pt-BR');
    expect(browserLocale(['PT'])).toBe('pt-BR');
  });

  it('inglês quando ele vem antes, ou quando não há nenhum dos dois', () => {
    expect(browserLocale(['en-US', 'pt-BR'])).toBe('en');
    expect(browserLocale(['es-ES', 'fr-FR'])).toBe('en');
    expect(browserLocale([])).toBe('en');
  });

  it('o primeiro idioma conhecido decide, mesmo depois de outros', () => {
    expect(browserLocale(['es-AR', 'pt-BR', 'en'])).toBe('pt-BR');
  });
});
