import { type Locale, t } from './i18n';

/**
 * Botão do canto inferior esquerdo que liga e desliga a alta qualidade.
 * Desligada, o laboratório entra no modo leve (`LIGHTWEIGHT_SETTINGS`): sem
 * sombras, bloom, oclusão ambiente, profundidade de campo, luz de área e
 * detalhes de superfície — para computadores e celulares mais fracos.
 *
 * Toda visita começa no modo leve (chave desligada): quem tem uma máquina
 * boa liga a alta qualidade quando quiser. A escolha não é guardada.
 */

export interface QualityToggle {
  readonly element: HTMLElement;
  /** Enquanto os shaders compilam: o botão mostra "aplicando" e não aceita clique. */
  setBusy(busy: boolean): void;
  setLocale(locale: Locale): void;
  dispose(): void;
}

export interface QualityToggleOptions {
  readonly parent: HTMLElement;
  readonly locale: Locale;
  readonly lightweight: boolean;
  readonly onChange: (lightweight: boolean) => void;
}

const SPARK_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.2 9.5 6.5 14.8 8 9.5 9.5 8 14.8 6.5 9.5 1.2 8 6.5 6.5z"/></svg>';

export function createQualityToggle({
  parent,
  locale: initialLocale,
  lightweight: initial,
  onChange,
}: QualityToggleOptions): QualityToggle {
  let locale = initialLocale;
  let lightweight = initial;
  let busy = false;

  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'quality-toggle';
  const label = document.createElement('span');
  label.className = 'quality-toggle__label';
  const knob = document.createElement('span');
  knob.className = 'quality-toggle__switch';
  knob.setAttribute('aria-hidden', 'true');
  element.innerHTML = SPARK_ICON;
  element.append(label, knob);
  parent.appendChild(element);

  const render = (): void => {
    const high = !lightweight;
    element.setAttribute('aria-pressed', String(high));
    element.classList.toggle('quality-toggle--off', !high);
    label.textContent = t(busy ? 'applying' : 'highQuality', locale);
    element.disabled = busy;
    element.classList.toggle('quality-toggle--busy', busy);
    const hint = t(high ? 'highQualityOn' : 'highQualityOff', locale);
    element.title = hint;
    element.setAttribute('aria-label', `${t('highQuality', locale)}: ${hint}`);
  };
  render();

  element.addEventListener('click', () => {
    lightweight = !lightweight;
    render();
    onChange(lightweight);
  });

  return {
    element,
    setBusy(next: boolean): void {
      busy = next;
      render();
    },
    setLocale(next: Locale): void {
      locale = next;
      render();
    },
    dispose(): void {
      element.remove();
    },
  };
}
