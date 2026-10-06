import { type Locale, t } from './i18n';
import type { ScreenRect } from './portrait-viewer';

/**
 * Visualizador de vídeo: clicar na TV da bancada faz a tela dela sair para a
 * frente, grande, e o vídeo começa a tocar — como os quadros da parede
 * (ui/portrait-viewer.ts), com a mesma animação FLIP a partir do retângulo da
 * tela 3D projetado pela câmera.
 *
 * Fecha com o ×, com Esc ou clicando fora do vídeo; ao fechar, o vídeo pausa
 * e lembra onde parou (abrir de novo continua dali). `onOpen` e `onClosed`
 * avisam quem precisa se calar enquanto ele toca (a música de fundo).
 */

export interface VideoSpec {
  readonly src: string;
  readonly poster?: string;
  readonly title: Readonly<Record<Locale, string>>;
  readonly description?: Readonly<Record<Locale, string>>;
  /** Onde a tela da TV está agora, ou null se fora de vista. */
  readonly sourceRect: () => ScreenRect | null;
}

export interface VideoViewer {
  readonly isOpen: boolean;
  open(spec: VideoSpec): void;
  close(): void;
  setLocale(locale: Locale): void;
  dispose(): void;
}

export interface VideoViewerOptions {
  readonly parent: HTMLElement;
  readonly locale: Locale;
  readonly onOpen?: () => void;
  readonly onClosed?: () => void;
}

const FLY_MS = 620;
const EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

export function createVideoViewer({ parent, locale: initialLocale, onOpen, onClosed }: VideoViewerOptions): VideoViewer {
  let locale = initialLocale;
  let current: VideoSpec | null = null;
  let closing = false;
  /** Quando abriu: o toque que abriu ainda gera um clique, que cai no fundo. */
  let openedAt = 0;
  const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const root = document.createElement('div');
  root.className = 'video-viewer';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');

  const backdrop = document.createElement('div');
  backdrop.className = 'video-viewer__backdrop';

  const stage = document.createElement('div');
  stage.className = 'video-viewer__stage';

  const frame = document.createElement('div');
  frame.className = 'video-viewer__frame';
  const video = document.createElement('video');
  video.className = 'video-viewer__video';
  video.controls = true;
  video.playsInline = true;
  video.preload = 'none';
  frame.appendChild(video);

  const bar = document.createElement('div');
  bar.className = 'video-viewer__bar';
  const text = document.createElement('div');
  text.className = 'video-viewer__text';
  const title = document.createElement('h2');
  title.className = 'video-viewer__title';
  const description = document.createElement('p');
  description.className = 'video-viewer__description';
  text.append(title, description);
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'video-viewer__close';
  closeButton.textContent = '×';
  bar.append(text, closeButton);

  stage.append(frame, bar);
  root.append(backdrop, stage);
  parent.appendChild(root);

  const render = (): void => {
    if (!current) return;
    title.textContent = current.title[locale];
    description.textContent = current.description?.[locale] ?? '';
    description.hidden = !current.description;
    root.setAttribute('aria-label', current.title[locale]);
    closeButton.setAttribute('aria-label', t('closeVideo', locale));
    closeButton.title = t('closeVideo', locale);
  };

  /** Transformação que leva o vídeo da sua posição final até `from`. */
  const flipFrom = (from: ScreenRect): string => {
    const to = frame.getBoundingClientRect();
    const sx = from.width / Math.max(to.width, 1);
    const sy = from.height / Math.max(to.height, 1);
    return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`;
  };

  const finishClose = (): void => {
    root.hidden = true;
    root.classList.remove('video-viewer--open');
    current = null;
    closing = false;
    onClosed?.();
  };

  const close = (): void => {
    if (!current || closing) return;
    closing = true;
    video.pause();
    root.classList.remove('video-viewer--open');
    const target = current.sourceRect();
    if (reducedMotion() || !target) {
      finishClose();
      return;
    }
    const animation = frame.animate([{ transform: 'none' }, { transform: flipFrom(target) }], {
      duration: FLY_MS * 0.85,
      easing: 'cubic-bezier(0.4, 0, 0.6, 1)',
      fill: 'forwards',
    });
    animation.onfinish = () => {
      finishClose();
      animation.cancel();
    };
  };

  const open = (spec: VideoSpec): void => {
    if (current) return;
    current = spec;
    openedAt = performance.now();
    render();
    // O mesmo vídeo continua de onde parou; outro recomeça do início.
    if (video.getAttribute('src') !== spec.src) {
      video.src = spec.src;
      if (spec.poster) video.poster = spec.poster;
    }
    video.preload = 'auto';

    root.hidden = false;
    // Força o layout para medir a posição final antes de animar.
    void root.offsetWidth;
    root.classList.add('video-viewer--open');
    onOpen?.();
    // O clique na TV é o gesto que libera o som: o play pode ir já.
    video.play().catch(() => {
      // Bloqueado ou sem rede: os controles do vídeo ficam à mão.
    });
    video.focus({ preventScroll: true });

    const from = spec.sourceRect();
    if (!from || reducedMotion()) return;
    frame.animate([{ transform: flipFrom(from) }, { transform: 'none' }], { duration: FLY_MS, easing: EASING });
  };

  // No celular, o "click" do toque que abriu chega depois, já sobre o fundo:
  // ignora cliques no primeiro instante.
  const closeByClick = (): void => {
    if (performance.now() - openedAt > 450) close();
  };
  backdrop.addEventListener('click', closeByClick);
  stage.addEventListener('click', (event) => {
    if (event.target === stage) closeByClick();
  });
  closeButton.addEventListener('click', close);
  const onKey = (event: KeyboardEvent): void => {
    if (!current) return;
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  };
  window.addEventListener('keydown', onKey, true);
  // As teclas apertadas no vídeo são dele (espaço pausa, setas avançam): não
  // sobem até os atalhos do laboratório.
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') event.stopPropagation();
  });

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
      video.pause();
      video.removeAttribute('src');
      root.remove();
    },
  };
}
