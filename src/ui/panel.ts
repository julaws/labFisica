import type { Experiment, NumberRow, PanelControl, PanelSchema } from '../core/experiment';
import { type Locale, formatDistance, formatFNumber, t } from './i18n';

/**
 * Painel de controles (SPEC §3.3), renderizado a partir do `PanelSchema`
 * declarativo que o experimento devolve em `ui()`.
 *
 * O painel não conhece o experimento por dentro: ele lê valores com
 * `experiment.get(id)` e escreve com `experiment.set(id, valor)`. Todos os
 * controles — anel 3D, slider, atalhos, miniaturas — mexem no mesmo estado e
 * se sincronizam sozinhos, porque todos passam pela store do experimento.
 *
 * No celular o painel vira uma gaveta inferior (SPEC §3.3); isso é CSS mais um
 * botão de abrir e fechar, não um componente separado.
 */

export interface Panel {
  readonly element: HTMLElement;
  /** Atualiza o estado visual dos controles a partir do experimento. */
  sync(): void;
  setLocale(locale: Locale): void;
  dispose(): void;
}

export interface PanelOptions {
  readonly parent: HTMLElement;
  readonly experiment: Experiment;
  readonly locale: Locale;
  readonly onHelp: () => void;
  readonly onLocaleChange: (locale: Locale) => void;
}

/** Faixa do slider de distância, em escala logarítmica (SPEC §6.2). */
const SLIDER_STEPS = 1000;

export function createPanel({
  parent,
  experiment,
  locale: initialLocale,
  onHelp,
  onLocaleChange,
}: PanelOptions): Panel {
  let locale = initialLocale;

  const element = document.createElement('aside');
  element.className = 'control-panel panel';
  element.setAttribute('aria-label', t('controls', locale));

  // Alça da gaveta no celular. No desktop o CSS a esconde.
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'drawer-handle';
  handle.setAttribute('aria-expanded', 'false');
  handle.addEventListener('click', () => {
    const open = element.classList.toggle('control-panel--open');
    handle.setAttribute('aria-expanded', String(open));
  });

  const body = document.createElement('div');
  body.className = 'control-panel__body';

  element.append(handle, body);
  parent.appendChild(element);

  const syncers: (() => void)[] = [];
  let numbersBody: HTMLElement | null = null;

  function build(): void {
    body.replaceChildren();
    syncers.length = 0;
    handle.textContent = t('controls', locale);

    const schema: PanelSchema = experiment.ui();

    for (const group of schema.groups) {
      const section = document.createElement('section');
      section.className = 'control-group';

      const heading = document.createElement('h2');
      heading.className = 'control-group__title';
      heading.textContent = group.label[locale];
      section.appendChild(heading);

      for (const control of group.controls) {
        section.appendChild(buildControl(control));
      }

      body.appendChild(section);
    }

    // Rodapé: Números, idioma e ajuda.
    const footer = document.createElement('div');
    footer.className = 'control-panel__footer';

    const numbersToggle = document.createElement('button');
    numbersToggle.type = 'button';
    numbersToggle.className = 'button';
    numbersToggle.textContent = t('numbers', locale);
    numbersToggle.setAttribute('aria-pressed', String(Boolean(experiment.get('showNumbers'))));
    numbersToggle.addEventListener('click', () => {
      experiment.set('showNumbers', !experiment.get('showNumbers'));
    });
    syncers.push(() => {
      const on = Boolean(experiment.get('showNumbers'));
      numbersToggle.setAttribute('aria-pressed', String(on));
      if (numbersBody) numbersBody.hidden = !on;
    });

    const languageToggle = document.createElement('button');
    languageToggle.type = 'button';
    languageToggle.className = 'button';
    languageToggle.textContent = locale === 'pt-BR' ? 'EN' : 'PT';
    languageToggle.setAttribute('aria-label', t('language', locale));
    languageToggle.addEventListener('click', () => {
      onLocaleChange(locale === 'pt-BR' ? 'en' : 'pt-BR');
    });

    const help = document.createElement('button');
    help.type = 'button';
    help.className = 'button button--round';
    help.textContent = '?';
    help.setAttribute('aria-label', t('help', locale));
    help.addEventListener('click', onHelp);

    footer.append(numbersToggle, languageToggle, help);
    body.appendChild(footer);

    numbersBody = document.createElement('dl');
    numbersBody.className = 'numbers';
    numbersBody.hidden = !experiment.get('showNumbers');
    body.appendChild(numbersBody);
    syncers.push(() => renderNumbers(experiment.numbers(locale)));

    for (const sync of syncers) sync();
  }

  function renderNumbers(rows: readonly NumberRow[]): void {
    if (!numbersBody || numbersBody.hidden) return;
    numbersBody.replaceChildren();
    for (const row of rows) {
      const term = document.createElement('dt');
      term.textContent = row.label;
      if (row.hint) term.title = row.hint;
      const value = document.createElement('dd');
      value.textContent = row.value;
      numbersBody.append(term, value);
    }
  }

  function buildControl(control: PanelControl): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = `control control--${control.kind}`;

    const label = document.createElement('span');
    label.className = 'control__label';
    label.textContent = control.label[locale];
    label.id = `label-${control.id}`;
    wrapper.appendChild(label);

    switch (control.kind) {
      case 'segmented': {
        const group = document.createElement('div');
        group.className = 'segmented';
        group.setAttribute('role', 'radiogroup');
        group.setAttribute('aria-labelledby', label.id);

        const buttons = control.options.map((option) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'segmented__option';
          button.textContent = option.label;
          button.setAttribute('role', 'radio');
          button.addEventListener('click', () => experiment.set(control.id, option.value));
          group.appendChild(button);
          return { button, value: option.value };
        });

        syncers.push(() => {
          const current = experiment.get(control.id);
          for (const { button, value } of buttons) {
            const active = sameValue(current, value);
            button.classList.toggle('segmented__option--active', active);
            button.setAttribute('aria-checked', String(active));
          }
        });

        wrapper.appendChild(group);
        break;
      }

      case 'slider': {
        const row = document.createElement('div');
        row.className = 'slider-row';

        const input = document.createElement('input');
        input.type = 'range';
        input.min = '0';
        input.max = String(SLIDER_STEPS);
        input.step = '1';
        input.setAttribute('aria-labelledby', label.id);

        const readout = document.createElement('output');
        readout.className = 'slider-row__value';

        // Escala logarítmica: o curso do slider cobre razões de distância
        // iguais, como o anel de foco (SPEC §6.2).
        const toValue = (position: number): number =>
          control.logarithmic
            ? control.min * (control.max / control.min) ** (position / SLIDER_STEPS)
            : control.min + (control.max - control.min) * (position / SLIDER_STEPS);
        const toPosition = (value: number): number => {
          if (!Number.isFinite(value)) return SLIDER_STEPS;
          const clamped = Math.min(Math.max(value, control.min), control.max);
          return control.logarithmic
            ? (Math.log(clamped / control.min) / Math.log(control.max / control.min)) * SLIDER_STEPS
            : ((clamped - control.min) / (control.max - control.min)) * SLIDER_STEPS;
        };

        input.addEventListener('input', () => experiment.set(control.id, toValue(Number(input.value))));

        syncers.push(() => {
          const value = Number(experiment.get(control.id));
          if (document.activeElement !== input) input.value = String(Math.round(toPosition(value)));
          readout.textContent = formatDistance(value, locale);
          input.setAttribute('aria-valuetext', readout.textContent);
        });

        row.append(input, readout);
        wrapper.appendChild(row);
        break;
      }

      case 'stops': {
        const row = document.createElement('div');
        row.className = 'slider-row';

        const input = document.createElement('input');
        input.type = 'range';
        input.min = '0';
        input.max = String(control.values.length - 1);
        input.step = '1';
        input.setAttribute('aria-labelledby', label.id);

        const readout = document.createElement('output');
        readout.className = 'slider-row__value';

        input.addEventListener('input', () => {
          const value = control.values[Number(input.value)];
          if (value !== undefined) experiment.set(control.id, value);
        });

        syncers.push(() => {
          const current = Number(experiment.get(control.id));
          let index = 0;
          let best = Infinity;
          control.values.forEach((value, i) => {
            const gap = Math.abs(Math.log(value) - Math.log(current));
            if (gap < best) {
              best = gap;
              index = i;
            }
          });
          if (document.activeElement !== input) input.value = String(index);
          readout.textContent = formatFNumber(current, locale);
          input.setAttribute('aria-valuetext', readout.textContent);
        });

        row.append(input, readout);
        wrapper.appendChild(row);
        break;
      }

      case 'toggle': {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button';
        button.setAttribute('aria-labelledby', label.id);
        button.addEventListener('click', () => experiment.set(control.id, !experiment.get(control.id)));
        syncers.push(() => {
          const on = Boolean(experiment.get(control.id));
          button.setAttribute('aria-pressed', String(on));
          button.textContent = on ? '●' : '○';
        });
        wrapper.appendChild(button);
        break;
      }
    }

    return wrapper;
  }

  build();

  return {
    element,
    sync(): void {
      for (const sync of syncers) sync();
    },
    setLocale(next: Locale): void {
      locale = next;
      element.setAttribute('aria-label', t('controls', locale));
      build();
    },
    dispose(): void {
      element.remove();
      syncers.length = 0;
    },
  };
}

/** Compara valores de controle tolerando número vindo como texto. */
function sameValue(a: string | number | boolean, b: string | number | boolean): boolean {
  if (typeof a === 'number' || typeof b === 'number') {
    return Math.abs(Number(a) - Number(b)) < 1e-6 * Math.max(1, Math.abs(Number(b)));
  }
  return a === b;
}
