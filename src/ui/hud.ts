import type { HudHighlight, HudModel } from '../core/experiment';

/**
 * HUD (SPEC §3.3): título, subtítulo, três valores e a frase dinâmica, soltos
 * sobre a cena no canto superior esquerdo. Só os valores e a frase ganham
 * fundo; o título flutua sobre um gradiente escuro, como na referência.
 *
 * Os valores ficam numa região `aria-live="polite"` (SPEC §9), então quem usa
 * leitor de tela ouve a zona nítida mudar enquanto gira o anel.
 *
 * O HUD não calcula nada. Ele recebe um `HudModel` já formatado e só troca o
 * texto que mudou, para não recriar DOM a cada quadro de arraste.
 */

export interface Hud {
  readonly element: HTMLElement;
  render(model: HudModel): void;
  dispose(): void;
}

export function createHud(parent: HTMLElement): Hud {
  const element = document.createElement('section');
  element.className = 'hud';
  element.setAttribute('aria-labelledby', 'hud-title');

  // Título em duas linhas: as duas últimas palavras ("de foco", "of focus")
  // vão grandes e em ciano, o começo vai pequeno por cima.
  const title = document.createElement('h1');
  title.id = 'hud-title';
  title.className = 'brand';
  const titleLead = document.createElement('span');
  titleLead.className = 'brand__lead';
  const titleMain = document.createElement('span');
  titleMain.className = 'brand__main';
  title.append(titleLead, titleMain);

  const subtitle = document.createElement('p');
  subtitle.className = 'brand__lede';

  const chips = document.createElement('div');
  chips.className = 'hud__chips';
  chips.setAttribute('aria-live', 'polite');
  chips.setAttribute('aria-atomic', 'true');

  const sentence = document.createElement('p');
  sentence.className = 'hud__sentence';
  sentence.setAttribute('aria-live', 'polite');

  element.append(title, subtitle, chips, sentence);
  parent.appendChild(element);

  const chipElements = new Map<string, { label: HTMLSpanElement; value: HTMLSpanElement }>();
  let lastTitle = '';
  let lastSentence = '';

  const setText = (node: HTMLElement, text: string): void => {
    if (node.textContent !== text) node.textContent = text;
  };

  return {
    element,

    render(model: HudModel): void {
      if (model.title !== lastTitle) {
        lastTitle = model.title;
        const words = model.title.split(/\s+/);
        const split = Math.max(1, words.length - 2);
        titleLead.textContent = words.slice(0, split).join(' ');
        titleMain.textContent = words.slice(split).join(' ');
      }

      setText(subtitle, model.subtitle);

      const sentenceKey = `${model.sentence}|${JSON.stringify(model.highlights ?? [])}`;
      if (sentenceKey !== lastSentence) {
        lastSentence = sentenceKey;
        sentence.replaceChildren(...highlight(model.sentence, model.highlights ?? []));
      }

      for (const chip of model.chips) {
        let entry = chipElements.get(chip.id);
        if (!entry) {
          const wrapper = document.createElement('div');
          wrapper.className = 'chip';
          wrapper.dataset.id = chip.id;
          const label = document.createElement('span');
          label.className = 'chip__label';
          const value = document.createElement('span');
          value.className = 'chip__value';
          wrapper.append(label, value);
          chips.appendChild(wrapper);
          entry = { label, value };
          chipElements.set(chip.id, entry);
        }
        setText(entry.label, chip.label);
        setText(entry.value, chip.value);
      }

      // Ao trocar de experimento, os chips do anterior saem.
      const ids = new Set(model.chips.map((chip) => chip.id));
      for (const id of [...chipElements.keys()]) {
        if (ids.has(id)) continue;
        chips.querySelector(`[data-id="${CSS.escape(id)}"]`)?.remove();
        chipElements.delete(id);
      }
    },

    dispose(): void {
      element.remove();
      chipElements.clear();
    },
  };
}

/**
 * Quebra a frase em nós de texto e `<span>` destacados. Monta o DOM com
 * `textContent`, nunca com `innerHTML`: a frase vem do experimento, mas não
 * há por que confiar em marcação.
 */
function highlight(text: string, highlights: readonly HudHighlight[]): Node[] {
  const usable = highlights.filter((item) => item.text.length > 0);
  if (usable.length === 0) return [document.createTextNode(text)];

  // Os mais longos primeiro: "0,7 cm" não pode perder para "7".
  const sorted = [...usable].sort((a, b) => b.text.length - a.text.length);
  const escaped = sorted.map((item) => item.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Fronteira de palavra que entende acentos: "pico" não acende em "picos".
  const pattern = new RegExp(`(?<![\\p{L}\\d])(${escaped.join('|')})(?![\\p{L}\\d])`, 'giu');

  const nodes: Node[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start > cursor) nodes.push(document.createTextNode(text.slice(cursor, start)));
    const found = match[0];
    const tone = sorted.find((item) => item.text.toLowerCase() === found.toLowerCase())?.tone;
    const span = document.createElement(tone === 'strong' ? 'b' : 'span');
    if (tone && tone !== 'strong') span.className = `tone tone--${tone}`;
    span.textContent = found;
    nodes.push(span);
    cursor = start + found.length;
  }
  if (cursor < text.length) nodes.push(document.createTextNode(text.slice(cursor)));
  return nodes;
}
