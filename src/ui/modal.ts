import type { ExperimentCopy } from '../core/experiment';
import { type Locale, t } from './i18n';

/**
 * Modal "?" (SPEC §6.7): as seções didáticas do experimento mais a lista de
 * atalhos. Acessível por teclado: prende o foco enquanto aberto, fecha com Esc
 * e devolve o foco a quem o abriu (SPEC §9).
 */

export interface Shortcut {
  readonly keys: string;
  readonly description: Record<Locale, string>;
}

export interface Modal {
  open(): void;
  close(): void;
  toggle(): void;
  readonly isOpen: boolean;
  render(copy: ExperimentCopy, locale: Locale): void;
  dispose(): void;
}

export function createModal(parent: HTMLElement, shortcuts: readonly Shortcut[]): Modal {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.hidden = true;

  const dialog = document.createElement('div');
  dialog.className = 'modal panel';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'modal-title');
  dialog.tabIndex = -1;

  backdrop.appendChild(dialog);
  parent.appendChild(backdrop);

  let returnFocus: HTMLElement | null = null;

  const onKey = (event: KeyboardEvent): void => {
    if (backdrop.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;

    // Prende o foco dentro do diálogo.
    const focusable = dialog.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey);

  function open(): void {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    backdrop.hidden = false;
    dialog.focus();
  }

  function close(): void {
    backdrop.hidden = true;
    returnFocus?.focus();
  }

  return {
    open,
    close,
    toggle(): void {
      if (backdrop.hidden) open();
      else close();
    },
    get isOpen(): boolean {
      return !backdrop.hidden;
    },

    render(copy: ExperimentCopy, locale: Locale): void {
      dialog.replaceChildren();

      const header = document.createElement('header');
      header.className = 'modal__header';
      const title = document.createElement('h2');
      title.id = 'modal-title';
      title.className = 'modal__title';
      title.textContent = copy.title[locale];
      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'button button--round';
      closeButton.textContent = '×';
      closeButton.setAttribute('aria-label', t('close', locale));
      closeButton.addEventListener('click', close);
      header.append(title, closeButton);
      dialog.appendChild(header);

      const content = document.createElement('div');
      content.className = 'modal__content';

      for (const section of copy.sections) {
        const block = document.createElement('section');
        block.className = 'modal__section';
        const heading = document.createElement('h3');
        heading.textContent = section.heading[locale];
        block.appendChild(heading);
        for (const paragraph of section.body[locale].split('\n\n')) {
          const p = document.createElement('p');
          p.textContent = paragraph;
          block.appendChild(p);
        }
        content.appendChild(block);
      }

      const keys = document.createElement('section');
      keys.className = 'modal__section';
      const keysHeading = document.createElement('h3');
      keysHeading.textContent = t('shortcuts', locale);
      const list = document.createElement('dl');
      list.className = 'shortcuts';
      for (const shortcut of shortcuts) {
        const term = document.createElement('dt');
        for (const key of shortcut.keys.split(' ')) {
          const kbd = document.createElement('kbd');
          kbd.textContent = key;
          term.appendChild(kbd);
        }
        const description = document.createElement('dd');
        description.textContent = shortcut.description[locale];
        list.append(term, description);
      }
      keys.append(keysHeading, list);
      content.appendChild(keys);

      dialog.appendChild(content);
    },

    dispose(): void {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
    },
  };
}
