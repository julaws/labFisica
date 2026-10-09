import { type Locale, t } from './i18n';

/**
 * Tutorial animado da interface ("Como usar"): um botão no canto inferior
 * esquerdo, acima da chave de qualidade, abre um passeio em cinco paradas. A
 * tela escurece, um quadro aceso desliza de um controle ao outro (com um pulso
 * ao chegar) e um cartão ao lado explica o que cada um faz.
 *
 * As paradas são achadas por seletor na hora de cada passo: o passeio
 * acompanha o layout de verdade (gaveta no celular, seletor no rodapé em
 * telas médias). Uma parada sem elemento visível é pulada.
 *
 * Teclado: ← e → andam, Esc fecha. Com `prefers-reduced-motion`, o quadro
 * salta em vez de deslizar (o CSS desliga as transições).
 */

export interface Tour {
  readonly button: HTMLButtonElement;
  /** Mostra ou esconde o botão (ele só existe no primeiro experimento). */
  setAvailable(available: boolean): void;
  start(): void;
  close(): void;
  readonly isOpen: boolean;
  setLocale(locale: Locale): void;
  dispose(): void;
}

export interface TourOptions {
  readonly parent: HTMLElement;
  readonly locale: Locale;
}

type StringKey = Parameters<typeof t>[0];

interface Stop {
  readonly selector: string;
  readonly title: StringKey;
  readonly text: StringKey;
  /** No celular o layout muda (gaveta, seletor no rodapé): outro texto. */
  readonly touchText: StringKey;
}

/** A ordem do passeio: controles, música e câmera, explicação, qualidade, seletor. */
const STOPS: readonly Stop[] = [
  { selector: '.control-panel', title: 'tourControlsTitle', text: 'tourControlsText', touchText: 'tourControlsTextTouch' },
  { selector: '.corner-dock', title: 'tourDockTitle', text: 'tourDockText', touchText: 'tourDockTextTouch' },
  { selector: '.hud', title: 'tourHudTitle', text: 'tourHudText', touchText: 'tourHudTextTouch' },
  { selector: '.quality-toggle', title: 'tourQualityTitle', text: 'tourQualityText', touchText: 'tourQualityTextTouch' },
  { selector: '.station-switcher', title: 'tourSwitcherTitle', text: 'tourSwitcherText', touchText: 'tourSwitcherTextTouch' },
];

const PLAY_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6.6 5.2v5.6L11 8z"/></svg>';

const SEEN_KEY = 'optics-lab:tour-seen';
/** Mesmo corte do layout de celular em styles.css. */
const narrow = window.matchMedia('(max-width: 820px)');
const PAD = 8;

export function createTour({ parent, locale: initialLocale }: TourOptions): Tour {
  let locale = initialLocale;
  let open = false;
  let index = 0;
  let available = true;

  // --- Botão ----------------------------------------------------------------------
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tour-button';
  const label = document.createElement('span');
  button.innerHTML = PLAY_ICON;
  button.append(label);
  parent.appendChild(button);
  // Até o primeiro uso, o botão pulsa de leve para ser notado (preferência
  // de conveniência: sem armazenamento, só pulsa de novo).
  let seen = false;
  try {
    seen = window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    // Armazenamento bloqueado: segue pulsando.
  }
  button.classList.toggle('tour-button--fresh', !seen);

  // --- Camada do passeio --------------------------------------------------------------
  const layer = document.createElement('div');
  layer.className = 'tour';
  layer.hidden = true;
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  const spot = document.createElement('div');
  spot.className = 'tour__spot';
  const card = document.createElement('div');
  card.className = 'tour__card';
  const step = document.createElement('p');
  step.className = 'tour__step';
  const title = document.createElement('h2');
  title.className = 'tour__title';
  title.id = 'tour-title';
  const text = document.createElement('p');
  text.className = 'tour__text';
  const dots = document.createElement('div');
  dots.className = 'tour__dots';
  const actions = document.createElement('div');
  actions.className = 'tour__actions';
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'tour__skip';
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'tour__nav';
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'tour__nav tour__nav--primary';
  actions.append(skip, previous, next);
  card.append(step, title, text, dots, actions);
  layer.append(spot, card);
  layer.setAttribute('aria-labelledby', 'tour-title');
  parent.appendChild(layer);

  const visibleRect = (selector: string): DOMRect | null => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return null;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
    return rect;
  };

  /** As paradas que existem agora, com o elemento na tela. */
  const stops = (): Stop[] => STOPS.filter((stop) => visibleRect(stop.selector) !== null);

  const placeCard = (rect: DOMRect): void => {
    const margin = 16;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Ao lado do quadro onde houver espaço: embaixo, em cima, à esquerda, à direita.
    const candidates: [number, number][] = [
      [rect.left + rect.width / 2 - width / 2, rect.bottom + PAD + margin],
      [rect.left + rect.width / 2 - width / 2, rect.top - PAD - margin - height],
      [rect.left - PAD - margin - width, rect.top + rect.height / 2 - height / 2],
      [rect.right + PAD + margin, rect.top + rect.height / 2 - height / 2],
    ];
    const fits = ([x, y]: [number, number]): boolean => x >= margin && y >= margin && x + width <= vw - margin && y + height <= vh - margin;
    const chosen = candidates.find(fits) ?? [vw / 2 - width / 2, vh / 2 - height / 2];
    const x = Math.min(Math.max(chosen[0], margin), vw - width - margin);
    const y = Math.min(Math.max(chosen[1], margin), vh - height - margin);
    card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };

  const render = (): void => {
    const list = stops();
    if (list.length === 0) {
      close();
      return;
    }
    index = Math.min(Math.max(index, 0), list.length - 1);
    const stop = list[index]!;
    const rect = visibleRect(stop.selector)!;
    spot.style.transform = `translate(${Math.round(rect.left - PAD)}px, ${Math.round(rect.top - PAD)}px)`;
    spot.style.width = `${Math.round(rect.width + PAD * 2)}px`;
    spot.style.height = `${Math.round(rect.height + PAD * 2)}px`;
    // Pulso ao chegar: reinicia a animação a cada parada.
    spot.classList.remove('tour__spot--arrive');
    void spot.offsetWidth;
    spot.classList.add('tour__spot--arrive');

    step.textContent = `${t('tourStep', locale)} ${index + 1} / ${list.length}`;
    title.textContent = t(stop.title, locale);
    text.textContent = t(narrow.matches ? stop.touchText : stop.text, locale);
    dots.replaceChildren(
      ...list.map((_, i) => {
        const dot = document.createElement('span');
        dot.className = i === index ? 'tour__dot tour__dot--active' : 'tour__dot';
        return dot;
      }),
    );
    skip.textContent = t('tourSkip', locale);
    previous.textContent = t('tourPrevious', locale);
    previous.disabled = index === 0;
    next.textContent = t(index === list.length - 1 ? 'tourDone' : 'tourNext', locale);
    card.classList.remove('tour__card--enter');
    void card.offsetWidth;
    card.classList.add('tour__card--enter');
    placeCard(rect);
  };

  const onKey = (event: KeyboardEvent): void => {
    if (!open) return;
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowRight' || event.key === 'Enter') go(1);
    else if (event.key === 'ArrowLeft') go(-1);
    else return;
    // As setas também mexem na câmera e nos atalhos do laboratório: aqui não.
    event.preventDefault();
    event.stopPropagation();
  };
  const onResize = (): void => {
    if (open) render();
  };

  const go = (direction: 1 | -1): void => {
    const count = stops().length;
    if (direction === 1 && index >= count - 1) {
      close();
      return;
    }
    index += direction;
    render();
  };

  function start(): void {
    if (open) return;
    open = true;
    index = 0;
    layer.hidden = false;
    document.body.classList.add('tour-open');
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    try {
      window.localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Sem armazenamento: o botão volta a pulsar na próxima visita.
    }
    button.classList.remove('tour-button--fresh');
    // Primeiro quadro: o foco entra no centro da tela e desliza até a parada.
    spot.style.transform = `translate(${Math.round(window.innerWidth / 2 - 60)}px, ${Math.round(window.innerHeight / 2 - 40)}px)`;
    spot.style.width = '120px';
    spot.style.height = '80px';
    requestAnimationFrame(() => {
      render();
      next.focus({ preventScroll: true });
    });
  }

  function close(): void {
    if (!open) return;
    open = false;
    layer.hidden = true;
    document.body.classList.remove('tour-open');
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    button.focus({ preventScroll: true });
  }

  button.addEventListener('click', () => start());
  next.addEventListener('click', () => go(1));
  previous.addEventListener('click', () => go(-1));
  skip.addEventListener('click', () => close());
  // Clique fora do cartão também fecha (o escuro não bloqueia para sempre).
  layer.addEventListener('click', (event) => {
    if (event.target === layer || event.target === spot) close();
  });

  const syncButton = (): void => {
    label.textContent = t('tour', locale);
    button.title = t('tourHint', locale);
    button.setAttribute('aria-label', t('tourHint', locale));
    button.hidden = !available;
  };
  syncButton();

  return {
    button,
    setAvailable(next: boolean): void {
      available = next;
      if (!available) close();
      syncButton();
    },
    start,
    close,
    get isOpen(): boolean {
      return open;
    },
    setLocale(next: Locale): void {
      locale = next;
      syncButton();
      if (open) render();
    },
    dispose(): void {
      close();
      button.remove();
      layer.remove();
    },
  };
}
