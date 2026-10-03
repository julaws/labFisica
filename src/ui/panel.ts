import type { Experiment, NumberRow, PanelControl, PanelSchema } from '../core/experiment';
import { type Locale, formatDistance, formatFNumber, formatNumber, t } from './i18n';

/**
 * Painel de controles (SPEC §3.3), renderizado a partir do `PanelSchema`
 * declarativo que o experimento devolve em `ui()`.
 *
 * O painel não conhece o experimento por dentro: ele lê valores com
 * `experiment.get(id)` e escreve com `experiment.set(id, valor)`. Todos os
 * controles — anel 3D, slider, atalhos, miniaturas — mexem no mesmo estado e
 * se sincronizam sozinhos, porque todos passam pela store do experimento.
 *
 * Cada grupo do schema vira uma linha: o primeiro controle leva o rótulo do
 * grupo (com a dica de atalho à direita), os demais levam o próprio. É o
 * cartão compacto da referência, com todos os controles à vista.
 *
 * No celular o cartão desce para a base da tela; os controles marcados como
 * `secondary` ficam atrás de "Mais ajustes" para não cobrir a cena.
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
  /** Avança para a próxima câmera cinematográfica (tecla C). */
  readonly onCinematic?: () => void;
}

/** Resolução do slider de distância, em escala logarítmica (SPEC §6.2). */
const SLIDER_STEPS = 1000;

/** Ícones de 14 px, desenhados aqui para não depender de fonte de ícones. */
const ICONS = {
  camera:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h6A1.5 1.5 0 0 1 11 4.5v1.2l2.7-1.6a.8.8 0 0 1 1.3.7v6.4a.8.8 0 0 1-1.3.7L11 10.3v1.2A1.5 1.5 0 0 1 9.5 13h-6A1.5 1.5 0 0 1 2 11.5z"/></svg>',
  numbers:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h10v1.6H3zm0 3.7h10v1.6H3zm0 3.7h6.5V12H3z"/></svg>',
} as const;

export function createPanel({
  parent,
  experiment,
  locale: initialLocale,
  onHelp,
  onLocaleChange,
  onCinematic,
}: PanelOptions): Panel {
  let locale = initialLocale;
  let expanded = false;

  const element = document.createElement('aside');
  element.className = 'control-panel';
  element.setAttribute('aria-label', t('controls', locale));

  // Alça da gaveta: no celular o painel começa recolhido para a cena ocupar
  // a tela, e abre ao toque. No desktop ela é o cabeçalho do cartão e
  // minimiza o painel; ele abre minimizado se o experimento pedir.
  const phone = window.matchMedia('(max-width: 820px)').matches;
  let open = !phone && experiment.ui().startCollapsed !== true;
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'control-panel__handle';
  const handleLabel = document.createElement('span');
  const handleIcon = document.createElement('span');
  handleIcon.className = 'control-panel__chevron';
  handleIcon.setAttribute('aria-hidden', 'true');
  handle.append(handleLabel, handleIcon);
  handle.addEventListener('click', () => {
    open = !open;
    syncHandle();
  });

  const body = document.createElement('div');
  body.className = 'control-panel__body';

  // Só aparece no celular: mostra ou esconde os controles secundários.
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'control-panel__more';
  more.addEventListener('click', () => {
    expanded = !expanded;
    element.classList.toggle('control-panel--expanded', expanded);
    syncMore();
  });

  element.append(handle, body, more);
  parent.appendChild(element);

  const syncers: (() => void)[] = [];
  let numbersBody: HTMLElement | null = null;

  function syncHandle(): void {
    element.classList.toggle('control-panel--open', open);
    handle.setAttribute('aria-expanded', String(open));
    handleLabel.textContent = t('controls', locale);
  }

  function syncMore(): void {
    more.textContent = t(expanded ? 'fewerSettings' : 'moreSettings', locale);
    more.setAttribute('aria-expanded', String(expanded));
  }

  function build(): void {
    body.replaceChildren();
    syncers.length = 0;
    syncMore();
    syncHandle();

    const schema: PanelSchema = experiment.ui();

    schema.groups.forEach((group, groupIndex) => {
      const row = document.createElement('div');
      row.className = 'control-row';
      row.dataset.group = group.id;
      row.setAttribute('role', 'group');

      group.controls.forEach((control, index) => {
        // O primeiro controle da linha fala pelo grupo: "Foco", não "Plano".
        const label = index === 0 ? group.label[locale] : control.label[locale];
        const hint = index === 0 ? group.hint?.[locale] : undefined;
        row.appendChild(buildControl(control, label, hint, `${groupIndex}-${index}`));
      });

      // Ferramentas na ponta da segunda linha, como na referência: é a que
      // tem um slider para encolher e abrir espaço para elas.
      if (groupIndex === Math.min(1, schema.groups.length - 1)) row.appendChild(buildTools());

      body.appendChild(row);
    });

    numbersBody = document.createElement('dl');
    numbersBody.className = 'numbers';
    numbersBody.hidden = !experiment.get('showNumbers');
    body.appendChild(numbersBody);
    syncers.push(() => renderNumbers(experiment.numbers(locale)));

    for (const sync of syncers) sync();
  }

  function buildTools(): HTMLElement {
    const tools = document.createElement('div');
    tools.className = 'tools';

    const numbersToggle = toolButton(ICONS.numbers, t('numbers', locale), true);
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
    languageToggle.className = 'tool tool--text';
    languageToggle.textContent = locale === 'pt-BR' ? 'EN' : 'PT';
    languageToggle.title = t('language', locale);
    languageToggle.setAttribute('aria-label', t('language', locale));
    languageToggle.addEventListener('click', () => {
      onLocaleChange(locale === 'pt-BR' ? 'en' : 'pt-BR');
    });

    tools.append(numbersToggle, languageToggle);

    if (onCinematic) {
      const cinema = toolButton(ICONS.camera, `${t('cinematic', locale)} (C)`, false);
      cinema.classList.add('tool--light');
      cinema.addEventListener('click', onCinematic);
      tools.appendChild(cinema);
    }

    const help = document.createElement('button');
    help.type = 'button';
    help.className = 'tool tool--text';
    help.textContent = '?';
    help.title = t('help', locale);
    help.setAttribute('aria-label', t('help', locale));
    help.addEventListener('click', onHelp);
    tools.appendChild(help);

    return tools;
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

  function buildControl(
    control: PanelControl,
    labelText: string,
    hintText: string | undefined,
    key: string,
  ): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = `control control--${control.kind}`;
    if (control.secondary) wrapper.classList.add('control--secondary');

    const header = document.createElement('div');
    header.className = 'control__label';

    const label = document.createElement('span');
    label.textContent = labelText;
    label.id = `label-${control.id}-${key}`;

    // À direita do rótulo: a dica do atalho, ou a leitura do valor do slider.
    const aside = document.createElement('em');
    if (hintText) aside.textContent = hintText;

    header.append(label, aside);
    wrapper.appendChild(header);

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

        const slider = createSliderVisual(SLIDER_STEPS, label.id, 5);
        slider.input.addEventListener('input', () =>
          experiment.set(control.id, toValue(Number(slider.input.value))),
        );

        const band = control.band;
        syncers.push(() => {
          const value = Number(experiment.get(control.id));
          const position = toPosition(value);
          if (document.activeElement !== slider.input) {
            slider.input.value = String(Math.round(position));
          }
          slider.setPosition(position / SLIDER_STEPS);
          if (band) {
            const from = toPosition(Number(experiment.get(band.from))) / SLIDER_STEPS;
            const to = toPosition(Number(experiment.get(band.to))) / SLIDER_STEPS;
            slider.setBand(from, to);
          }
          // A unidade declarada no schema escolhe a leitura: distância em
          // mm (cm ou m na tela) ou micrômetros.
          const unit = control.unit ?? 'mm';
          const number = formatNumber(value, control.decimals ?? 0, locale);
          aside.textContent =
            unit === 'mm' ? formatDistance(value, locale) : unit === '°' ? `${number}°` : `${number} ${unit}`;
          slider.input.setAttribute('aria-valuetext', aside.textContent);
        });

        wrapper.appendChild(slider.element);
        break;
      }

      case 'stops': {
        const last = control.values.length - 1;
        const slider = createSliderVisual(last, label.id, last + 1);

        slider.input.addEventListener('input', () => {
          const value = control.values[Number(slider.input.value)];
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
          if (document.activeElement !== slider.input) slider.input.value = String(index);
          slider.setPosition(last > 0 ? index / last : 0);
          aside.textContent = formatFNumber(current, locale);
          slider.input.setAttribute('aria-valuetext', aside.textContent);
        });

        wrapper.appendChild(slider.element);
        break;
      }

      case 'checkboxes': {
        const group = document.createElement('div');
        group.className = 'checks';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-labelledby', label.id);

        const boxes = control.options.map((option) => {
          const key = `${control.id}.${option.value}`;
          const item = document.createElement('label');
          item.className = 'check';
          if (option.tone) item.dataset.tone = option.tone;

          const input = document.createElement('input');
          input.type = 'checkbox';
          input.className = 'check__input';
          input.addEventListener('change', () => experiment.set(key, input.checked));

          const text = document.createElement('span');
          text.className = 'check__label';
          text.textContent = option.label;

          item.append(input, text);
          group.appendChild(item);
          return { input, key };
        });

        syncers.push(() => {
          for (const { input, key } of boxes) input.checked = Boolean(experiment.get(key));
        });

        wrapper.appendChild(group);
        break;
      }

      case 'toggle': {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tool tool--text';
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

interface SliderVisual {
  readonly element: HTMLElement;
  readonly input: HTMLInputElement;
  /** Posição do botão, de 0 a 1. */
  setPosition(fraction: number): void;
  /** Faixa destacada sobre o trilho, de 0 a 1 nas duas pontas. */
  setBand(from: number, to: number): void;
}

/**
 * Slider desenhado em HTML sobre um `<input type="range">` transparente. O
 * input continua sendo o controle de verdade — teclado, toque, leitor de
 * tela —; o desenho só acompanha o valor dele.
 */
function createSliderVisual(max: number, labelledBy: string, ticks: number): SliderVisual {
  const element = document.createElement('div');
  element.className = 'slider';

  const track = document.createElement('div');
  track.className = 'slider__track';
  const band = document.createElement('div');
  band.className = 'slider__band';
  band.hidden = true;
  const fill = document.createElement('div');
  fill.className = 'slider__fill';
  const knob = document.createElement('div');
  knob.className = 'slider__knob';

  const tickRow = document.createElement('div');
  tickRow.className = 'slider__ticks';
  for (let i = 0; i < ticks; i += 1) tickRow.appendChild(document.createElement('i'));

  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'slider__input';
  input.min = '0';
  input.max = String(max);
  input.step = '1';
  input.setAttribute('aria-labelledby', labelledBy);

  element.append(track, tickRow, band, fill, input, knob);

  const percent = (fraction: number): string => `${(Math.min(1, Math.max(0, fraction)) * 100).toFixed(2)}%`;

  return {
    element,
    input,
    setPosition(fraction: number): void {
      fill.style.width = percent(fraction);
      knob.style.left = percent(fraction);
    },
    setBand(from: number, to: number): void {
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      band.hidden = !(hi > lo);
      band.style.left = percent(lo);
      band.style.width = `calc(${percent(hi - lo)} + 2px)`;
    },
  };
}

function toolButton(icon: string, label: string, pressable: boolean): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tool';
  button.title = label;
  button.setAttribute('aria-label', label);
  if (pressable) button.setAttribute('aria-pressed', 'false');
  // Ícones são constantes deste arquivo, não entrada de usuário.
  button.innerHTML = icon;
  return button;
}

/** Compara valores de controle tolerando número vindo como texto. */
function sameValue(a: string | number | boolean, b: string | number | boolean): boolean {
  if (typeof a === 'number' || typeof b === 'number') {
    return Math.abs(Number(a) - Number(b)) < 1e-6 * Math.max(1, Math.abs(Number(b)));
  }
  return a === b;
}
