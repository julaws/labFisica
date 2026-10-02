import type { ExperimentEntry, Locale } from '../core/experiment';
import { t } from './i18n';

/**
 * Seletor de experimentos (ADR 0008): uma pílula no topo da tela com uma aba
 * por bancada e as setas de anterior e seguinte. Escolher uma aba leva a
 * câmera até a outra bancada e troca o painel e o HUD.
 *
 * O componente não monta nada: ele só avisa qual experimento foi pedido.
 */

export interface StationSwitcher {
  readonly element: HTMLElement;
  setCurrent(id: string): void;
  /** Bloqueia os botões enquanto uma troca está em andamento. */
  setBusy(busy: boolean): void;
  setLocale(locale: Locale): void;
  dispose(): void;
}

export interface StationSwitcherOptions {
  readonly parent: HTMLElement;
  readonly entries: readonly ExperimentEntry[];
  readonly current: string;
  readonly locale: Locale;
  readonly onSelect: (id: string) => void;
}

const ARROW = (rotation: number): string =>
  `<svg viewBox="0 0 16 16" aria-hidden="true" style="transform: rotate(${rotation}deg)"><path d="M10.2 3.5 5.7 8l4.5 4.5-1.3 1.3L3.1 8l5.8-5.8z"/></svg>`;

export function createStationSwitcher({
  parent,
  entries,
  current: initial,
  locale: initialLocale,
  onSelect,
}: StationSwitcherOptions): StationSwitcher {
  let current = initial;
  let locale = initialLocale;

  const element = document.createElement('nav');
  element.className = 'station-switcher';

  const step = (direction: 1 | -1): void => {
    const index = entries.findIndex((entry) => entry.id === current);
    const next = entries[(index + direction + entries.length) % entries.length];
    if (next) onSelect(next.id);
  };

  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'station-switcher__arrow';
  previous.innerHTML = ARROW(0);
  previous.addEventListener('click', () => step(-1));

  const tabs = document.createElement('div');
  tabs.className = 'station-switcher__tabs';
  tabs.setAttribute('role', 'tablist');

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'station-switcher__arrow';
  next.innerHTML = ARROW(180);
  next.addEventListener('click', () => step(1));

  const buttons = entries.map((entry) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'station-switcher__tab';
    button.setAttribute('role', 'tab');
    button.addEventListener('click', () => onSelect(entry.id));
    tabs.appendChild(button);
    return { button, entry };
  });

  element.append(previous, tabs, next);
  parent.appendChild(element);

  const sync = (): void => {
    element.setAttribute('aria-label', t('experiments', locale));
    previous.setAttribute('aria-label', t('previousExperiment', locale));
    previous.title = t('previousExperiment', locale);
    next.setAttribute('aria-label', t('nextExperiment', locale));
    next.title = t('nextExperiment', locale);
    for (const { button, entry } of buttons) {
      button.textContent = entry.title[locale];
      const active = entry.id === current;
      button.classList.toggle('station-switcher__tab--active', active);
      button.setAttribute('aria-selected', String(active));
    }
  };
  sync();

  return {
    element,
    setCurrent(id: string): void {
      current = id;
      sync();
    },
    setBusy(busy: boolean): void {
      element.classList.toggle('station-switcher--busy', busy);
      for (const control of element.querySelectorAll('button')) control.disabled = busy;
    },
    setLocale(next: Locale): void {
      locale = next;
      sync();
    },
    dispose(): void {
      element.remove();
    },
  };
}
