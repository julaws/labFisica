import type { HudModel } from '../core/experiment';

/**
 * Cartão do HUD (SPEC §3.3): título, subtítulo, três valores e a frase
 * dinâmica. Os valores ficam numa região `aria-live="polite"` (SPEC §9), então
 * quem usa leitor de tela ouve a zona nítida mudar enquanto gira o anel.
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
  element.className = 'hud panel';
  element.setAttribute('aria-labelledby', 'hud-title');

  const title = document.createElement('h1');
  title.id = 'hud-title';
  title.className = 'hud__title';

  const subtitle = document.createElement('p');
  subtitle.className = 'hud__subtitle';

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

  const setText = (node: HTMLElement, text: string): void => {
    if (node.textContent !== text) node.textContent = text;
  };

  return {
    element,

    render(model: HudModel): void {
      setText(title, model.title);
      setText(subtitle, model.subtitle);
      setText(sentence, model.sentence);

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
    },

    dispose(): void {
      element.remove();
      chipElements.clear();
    },
  };
}
