import { type Locale, t } from './i18n';
import { PORTRAIT_COPY } from './portrait-copy';

/**
 * Visualizador de retratos: clicar num quadro da parede faz o quadro sair
 * para a frente da tela, grande e nítido (fora da cena 3D e do desfoque),
 * com um texto curto embaixo. Clicar de novo na imagem o devolve à parede.
 *
 * O quadro na tela tem as mesmas proporções do 3D (moldura, passe-partout,
 * foto) e começa exatamente sobre o retângulo do quadro na parede, projetado
 * pela câmera: a animação é uma só transformação (FLIP). Embaixo, a
 * biografia resumida e o crédito da foto. Enquanto a foto
 * ampliada carrega, o ladrilho do atlas, já baixado pela cena, faz as vezes
 * dela.
 */

export interface PortraitEntry {
  readonly id: string;
  readonly name: string;
  readonly years: string;
  /** Crédito da foto (autor, data, licença). */
  readonly credit: string;
  /** Foto ampliada (só a foto, 3:4). */
  readonly imageUrl: string;
}

export interface PortraitAtlas {
  readonly url: string;
  readonly columns: number;
  readonly rows: number;
  readonly tile: { readonly width: number; readonly height: number };
  readonly photo: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

/** Retângulo na tela, em pixels CSS. */
export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface PortraitViewer {
  readonly isOpen: boolean;
  open(index: number): void;
  close(): void;
  setLocale(locale: Locale): void;
  dispose(): void;
}

export interface PortraitViewerOptions {
  readonly parent: HTMLElement;
  readonly locale: Locale;
  readonly entries: readonly PortraitEntry[];
  readonly atlas: PortraitAtlas;
  /** Proporção largura/altura da moldura e a fração dela que o passe-partout ocupa. */
  readonly frame: { readonly aspect: number; readonly matWidth: number; readonly matHeight: number };
  /** Onde o quadro está agora na tela, ou null se fora de vista. */
  readonly sourceRect: (index: number) => ScreenRect | null;
  /** O quadro saiu da parede (esconda a foto lá) ou voltou. */
  readonly onOpen: (index: number) => void;
  readonly onClosed: (index: number) => void;
}

const FLY_MS = 620;
const EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

export function createPortraitViewer({
  parent,
  locale: initialLocale,
  entries,
  atlas,
  frame,
  sourceRect,
  onOpen,
  onClosed,
}: PortraitViewerOptions): PortraitViewer {
  let locale = initialLocale;
  let current: number | null = null;
  let closing = false;
  /** Quando abriu: o toque que abriu ainda gera um clique, que cai no fundo. */
  let openedAt = 0;
  const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const root = document.createElement('div');
  root.className = 'portrait-viewer';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');

  const backdrop = document.createElement('div');
  backdrop.className = 'portrait-viewer__backdrop';

  const stage = document.createElement('div');
  stage.className = 'portrait-viewer__stage';

  // A moldura é um botão: clicar nela devolve o quadro à parede.
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'portrait-viewer__frame';
  card.style.aspectRatio = String(frame.aspect);
  const mat = document.createElement('span');
  mat.className = 'portrait-viewer__mat';
  mat.style.width = `${frame.matWidth * 100}%`;
  mat.style.height = `${frame.matHeight * 100}%`;
  mat.style.backgroundImage = `url("${atlas.url}")`;
  mat.style.backgroundSize = `${atlas.columns * 100}% ${atlas.rows * 100}%`;
  const photo = document.createElement('img');
  photo.className = 'portrait-viewer__photo';
  photo.alt = '';
  photo.decoding = 'async';
  photo.style.left = `${(atlas.photo.x / atlas.tile.width) * 100}%`;
  photo.style.top = `${(atlas.photo.y / atlas.tile.height) * 100}%`;
  photo.style.width = `${(atlas.photo.width / atlas.tile.width) * 100}%`;
  photo.style.height = `${(atlas.photo.height / atlas.tile.height) * 100}%`;
  photo.addEventListener('load', () => photo.classList.add('portrait-viewer__photo--ready'));
  mat.appendChild(photo);
  card.appendChild(mat);

  const text = document.createElement('div');
  text.className = 'portrait-viewer__text';
  const name = document.createElement('h2');
  name.className = 'portrait-viewer__name';
  const years = document.createElement('p');
  years.className = 'portrait-viewer__years';
  const bio = document.createElement('p');
  bio.className = 'portrait-viewer__bio';
  const credit = document.createElement('p');
  credit.className = 'portrait-viewer__credit';
  text.append(name, years, bio, credit);

  stage.append(card, text);
  root.append(backdrop, stage);
  parent.appendChild(root);

  const render = (): void => {
    if (current === null) return;
    const entry = entries[current];
    const copy = entry ? PORTRAIT_COPY[entry.id]?.[locale] : undefined;
    if (!entry) return;
    name.textContent = entry.name;
    years.textContent = copy ? `${entry.years} · ${copy.field}` : entry.years;
    bio.textContent = copy?.bio ?? '';
    credit.textContent = `${t('photoCredit', locale)}: ${entry.credit}`;
    root.setAttribute('aria-label', entry.name);
    card.setAttribute('aria-label', t('portraitBack', locale));
    card.title = t('portraitBack', locale);
  };

  /** Transformação que leva o quadro da sua posição final até `from`. */
  const flipFrom = (from: ScreenRect): string => {
    const to = card.getBoundingClientRect();
    const sx = from.width / Math.max(to.width, 1);
    const sy = from.height / Math.max(to.height, 1);
    return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`;
  };

  const finishClose = (index: number): void => {
    root.hidden = true;
    root.classList.remove('portrait-viewer--open');
    current = null;
    closing = false;
    onClosed(index);
  };

  const close = (): void => {
    if (current === null || closing) return;
    closing = true;
    const index = current;
    root.classList.remove('portrait-viewer--open');
    const target = sourceRect(index);
    if (reducedMotion() || !target) {
      finishClose(index);
      return;
    }
    const animation = card.animate([{ transform: 'none' }, { transform: flipFrom(target) }], {
      duration: FLY_MS * 0.85,
      easing: 'cubic-bezier(0.4, 0, 0.6, 1)',
      fill: 'forwards',
    });
    animation.onfinish = () => {
      finishClose(index);
      animation.cancel();
    };
  };

  const open = (index: number): void => {
    const entry = entries[index];
    if (!entry || current !== null) return;
    current = index;
    openedAt = performance.now();
    render();

    const { columns, rows } = atlas;
    const column = index % columns;
    const row = Math.floor(index / columns);
    mat.style.backgroundPosition = `${columns > 1 ? (column / (columns - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`;
    photo.classList.remove('portrait-viewer__photo--ready');
    photo.src = entry.imageUrl;

    root.hidden = false;
    // Força o layout para medir a posição final antes de animar.
    void root.offsetWidth;
    root.classList.add('portrait-viewer--open');
    onOpen(index);
    // Foco no quadro (Enter ou Esc o devolvem), sem o anel de foco do clique.
    card.focus({ preventScroll: true, focusVisible: false });

    const from = sourceRect(index);
    if (!from || reducedMotion()) return;
    card.animate([{ transform: flipFrom(from) }, { transform: 'none' }], { duration: FLY_MS, easing: EASING });
  };

  // No celular, o "click" do toque que abriu chega depois, já sobre o fundo:
  // ignora cliques no primeiro instante.
  const closeByClick = (): void => {
    if (performance.now() - openedAt > 450) close();
  };
  card.addEventListener('click', closeByClick);
  backdrop.addEventListener('click', closeByClick);
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && current !== null) {
      event.stopPropagation();
      close();
    }
  };
  window.addEventListener('keydown', onKey, true);

  return {
    get isOpen(): boolean {
      return current !== null;
    },
    open,
    close,
    setLocale(next: Locale): void {
      locale = next;
      render();
    },
    dispose(): void {
      window.removeEventListener('keydown', onKey, true);
      root.remove();
    },
  };
}
