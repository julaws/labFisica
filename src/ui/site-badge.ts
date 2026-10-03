import { type Locale, formatNumber, t } from './i18n';

/**
 * Selo do canto inferior direito, ao lado da navegação: o contador de
 * visualizações da página e o link para o Instagram do autor.
 *
 * O contador é o Abacus (abacus.jasoncameron.dev), um serviço gratuito e
 * aberto, sem conta nem chave: `hit` soma um e devolve o total, `get` só lê.
 * O site estático não tem servidor próprio para guardar o número.
 *
 * - Só o endereço publicado soma visitas; o servidor de desenvolvimento e os
 *   testes apenas leem o total.
 * - Cada aba soma uma vez: recarregar a página não infla o número.
 * - Se o serviço falhar ou demorar, o número some e o link fica.
 */

export interface SiteBadge {
  readonly element: HTMLElement;
  setLocale(locale: Locale): void;
  dispose(): void;
}

export interface SiteBadgeOptions {
  readonly parent: HTMLElement;
  readonly locale: Locale;
}

const COUNTER = 'https://abacus.jasoncameron.dev';
const COUNTER_KEY = 'julaws-laboptica/views';
const PUBLISHED_HOST = 'julaws.github.io';
const SESSION_KEY = 'optics-lab:view-counted';
const INSTAGRAM_URL = 'https://www.instagram.com/juliophisico/';

const EYE_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.2c-3.3 0-5.8 2.4-6.8 4.8 1 2.4 3.5 4.8 6.8 4.8s5.8-2.4 6.8-4.8C13.8 5.6 11.3 3.2 8 3.2Zm0 7.9A3.1 3.1 0 1 1 8 4.9a3.1 3.1 0 0 1 0 6.2Zm0-4.7a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z"/></svg>';

const CAMERA_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 1.5h6A3.5 3.5 0 0 1 14.5 5v6a3.5 3.5 0 0 1-3.5 3.5H5A3.5 3.5 0 0 1 1.5 11V5A3.5 3.5 0 0 1 5 1.5Zm0 1.4A2.1 2.1 0 0 0 2.9 5v6A2.1 2.1 0 0 0 5 13.1h6a2.1 2.1 0 0 0 2.1-2.1V5A2.1 2.1 0 0 0 11 2.9H5Zm3 2.4a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4Zm0 1.4a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm3.1-2.3a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z"/></svg>';

/** Esta aba já somou a sua visita? */
function alreadyCounted(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function markCounted(): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // Armazenamento bloqueado: a próxima recarga soma de novo, sem prejuízo.
  }
}

async function fetchViews(signal: AbortSignal): Promise<number | null> {
  const count = window.location.hostname === PUBLISHED_HOST && !alreadyCounted();
  const response = await fetch(`${COUNTER}/${count ? 'hit' : 'get'}/${COUNTER_KEY}`, { signal });
  if (!response.ok) return null;
  const body: unknown = await response.json();
  const value = typeof body === 'object' && body !== null ? (body as { value?: unknown }).value : undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (count) markCounted();
  return value;
}

export function createSiteBadge({ parent, locale: initialLocale }: SiteBadgeOptions): SiteBadge {
  let locale = initialLocale;
  let views: number | null = null;

  const element = document.createElement('aside');
  element.className = 'site-badge';

  const counter = document.createElement('p');
  counter.className = 'site-badge__views';
  counter.hidden = true;
  const value = document.createElement('strong');
  const unit = document.createElement('span');
  counter.innerHTML = EYE_ICON;
  // O espaço é para o leitor de tela; na tela, quem separa é o `gap`.
  counter.append(value, ' ', unit);

  const link = document.createElement('a');
  link.className = 'site-badge__link';
  link.href = INSTAGRAM_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.innerHTML = `${CAMERA_ICON}<span>@juliophisico</span>`;

  element.append(counter, link);
  parent.prepend(element);

  const render = (): void => {
    link.title = t('instagram', locale);
    link.setAttribute('aria-label', t('instagram', locale));
    counter.title = t('pageViewsLabel', locale);
    unit.textContent = t(views === 1 ? 'pageView' : 'pageViews', locale);
    if (views !== null) {
      value.textContent = formatNumber(views, 0, locale);
      counter.hidden = false;
    }
  };
  render();

  const abort = new AbortController();
  const timeout = window.setTimeout(() => abort.abort(), 8000);
  fetchViews(abort.signal)
    .then((result) => {
      views = result;
      render();
    })
    .catch(() => {
      // Sem rede, serviço fora do ar ou bloqueado: fica só o link.
    })
    .finally(() => window.clearTimeout(timeout));

  return {
    element,
    setLocale(next: Locale): void {
      locale = next;
      render();
    },
    dispose(): void {
      abort.abort();
      element.remove();
    },
  };
}
