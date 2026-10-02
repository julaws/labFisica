import { type Locale, t } from './i18n';

/**
 * Controles de navegação no canto inferior direito: uma cruz que move a vista
 * (para cima, para baixo e para os lados), o centro que volta à vista padrão,
 * e duas setas de zoom (aproximar e afastar).
 *
 * Segurar um botão move de forma contínua, com velocidade independente da
 * taxa de quadros; um clique pelo teclado (Enter ou espaço) dá um passo. O
 * componente não conhece a câmera: ele só chama os callbacks com a direção e
 * o tempo decorrido, e quem o usa decide o que é "mover".
 */

export interface NavPad {
  readonly element: HTMLElement;
  setLocale(locale: Locale): void;
  dispose(): void;
}

export interface NavPadOptions {
  readonly parent: HTMLElement;
  readonly locale: Locale;
  /** Move a vista: x e y em {−1, 0, 1}, `dt` em segundos. */
  readonly onPan: (x: number, y: number, dt: number) => void;
  /** Zoom: +1 aproxima, −1 afasta. */
  readonly onZoom: (direction: number, dt: number) => void;
  /** Volta à vista padrão. */
  readonly onReset: () => void;
}

/** Quanto tempo vale um passo de teclado, em segundos de movimento contínuo. */
const KEYBOARD_STEP_SECONDS = 0.25;

const chevron = (rotation: number): string =>
  `<svg viewBox="0 0 16 16" aria-hidden="true" style="transform: rotate(${rotation}deg)"><path d="M3.5 10.2 8 5.7l4.5 4.5-1.3 1.3L8 8.3l-3.2 3.2z"/></svg>`;

const RESET_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.6"/></svg>';

export function createNavPad({ parent, locale: initialLocale, onPan, onZoom, onReset }: NavPadOptions): NavPad {
  let locale = initialLocale;

  const element = document.createElement('nav');
  element.className = 'nav-pad';

  const cross = document.createElement('div');
  cross.className = 'nav-pad__cross';
  const zoom = document.createElement('div');
  zoom.className = 'nav-pad__zoom';
  element.append(cross, zoom);
  parent.appendChild(element);

  interface Spec {
    readonly key: 'moveUp' | 'moveDown' | 'moveLeft' | 'moveRight' | 'zoomIn' | 'zoomOut' | 'reset';
    readonly area: string;
    readonly icon: string;
    readonly act?: (dt: number) => void;
    readonly sign?: string;
  }

  const crossSpecs: Spec[] = [
    { key: 'moveUp', area: 'up', icon: chevron(0), act: (dt) => onPan(0, 1, dt) },
    { key: 'moveLeft', area: 'left', icon: chevron(-90), act: (dt) => onPan(-1, 0, dt) },
    { key: 'reset', area: 'center', icon: RESET_ICON },
    { key: 'moveRight', area: 'right', icon: chevron(90), act: (dt) => onPan(1, 0, dt) },
    { key: 'moveDown', area: 'down', icon: chevron(180), act: (dt) => onPan(0, -1, dt) },
  ];
  const zoomSpecs: Spec[] = [
    { key: 'zoomIn', area: 'in', icon: chevron(0), sign: '+', act: (dt) => onZoom(1, dt) },
    { key: 'zoomOut', area: 'out', icon: chevron(180), sign: '−', act: (dt) => onZoom(-1, dt) },
  ];

  const buttons: { button: HTMLButtonElement; spec: Spec }[] = [];
  let frame = 0;
  let held: Spec | null = null;
  let last = 0;

  const tick = (now: number): void => {
    if (!held?.act) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    held.act(dt);
    frame = requestAnimationFrame(tick);
  };

  const stop = (): void => {
    held = null;
    cancelAnimationFrame(frame);
  };

  const build = (spec: Spec, container: HTMLElement): void => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `nav-pad__button nav-pad__button--${spec.area}`;
    button.innerHTML = spec.icon + (spec.sign ? `<span class="nav-pad__sign">${spec.sign}</span>` : '');

    if (spec.act) {
      const act = spec.act;
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        held = spec;
        last = performance.now();
        frame = requestAnimationFrame(tick);
      });
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
        button.addEventListener(name, stop);
      }
      // Teclado (Enter, espaço): um passo por acionamento. `detail === 0`
      // separa o clique de teclado do clique de mouse, que já moveu ao segurar.
      button.addEventListener('click', (event) => {
        if (event.detail === 0) act(KEYBOARD_STEP_SECONDS);
      });
    } else {
      button.addEventListener('click', onReset);
    }

    container.appendChild(button);
    buttons.push({ button, spec });
  };

  for (const spec of crossSpecs) build(spec, cross);
  for (const spec of zoomSpecs) build(spec, zoom);

  const applyLocale = (): void => {
    element.setAttribute('aria-label', t('navigation', locale));
    for (const { button, spec } of buttons) {
      const label = t(spec.key, locale);
      button.title = label;
      button.setAttribute('aria-label', label);
    }
  };
  applyLocale();

  return {
    element,
    setLocale(next: Locale): void {
      locale = next;
      applyLocale();
    },
    dispose(): void {
      stop();
      element.remove();
    },
  };
}
