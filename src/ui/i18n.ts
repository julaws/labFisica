/**
 * Idioma e formatação da interface (CLAUDE.md §7, SPEC §6.7).
 *
 * Textos em pt-BR, com a camada pronta para inglês. Números com **vírgula
 * decimal** e unidades brasileiras: 1 casa para cm, 2 a 3 para mm. Esta camada
 * só formata — ela nunca calcula grandeza física. Os valores chegam prontos do
 * motor em `src/optics/` (CLAUDE.md §3).
 */

export type Locale = 'pt-BR' | 'en';

const STORAGE_KEY = 'optics-lab:locale';

/** Idioma preferido, lembrado entre visitas quando o navegador permite. */
export function preferredLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'pt-BR' || stored === 'en') return stored;
  } catch {
    // Armazenamento bloqueado (aba privada, política do navegador): segue.
  }
  // O idioma padrão do laboratório é o português (CLAUDE.md §7), qualquer que
  // seja o navegador; o inglês é escolhido explicitamente no painel.
  return 'pt-BR';
}

export function rememberLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Só uma preferência: não é estado essencial (SPEC §13).
  }
}

/** Número com a vírgula ou o ponto do idioma e casas fixas. */
export function formatNumber(value: number, decimals: number, locale: Locale): string {
  return value.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  });
}

/** Distância em mm mostrada em cm, com 1 casa: 19 mm → "1,9 cm". */
export function formatCentimeters(millimeters: number, locale: Locale): string {
  if (!Number.isFinite(millimeters)) return '∞';
  return `${formatNumber(millimeters / 10, 1, locale)} cm`;
}

/** Distância em mm, com 2 ou 3 casas conforme a ordem de grandeza. */
export function formatMillimeters(millimeters: number, locale: Locale): string {
  if (!Number.isFinite(millimeters)) return '∞';
  const decimals = Math.abs(millimeters) < 1 ? 3 : 2;
  return `${formatNumber(millimeters, decimals, locale)} mm`;
}

/**
 * Distância de foco, escolhendo a unidade que se lê melhor: cm até 1 m, m
 * acima disso, e ∞ na posição de infinito do anel.
 */
export function formatDistance(millimeters: number, locale: Locale): string {
  if (!Number.isFinite(millimeters)) return '∞';
  if (millimeters < 1000) return formatCentimeters(millimeters, locale);
  return `${formatNumber(millimeters / 1000, 2, locale)} m`;
}

/** Número f como se grava nas objetivas: f/2, f/5,6, f/16. */
export function formatFNumber(fNumber: number, locale: Locale): string {
  const decimals = Number.isInteger(fNumber) ? 0 : 1;
  return `f/${formatNumber(fNumber, decimals, locale)}`;
}

/** Textos fixos da interface. Os do experimento ficam em copy.<locale>.ts. */
const STRINGS = {
  'pt-BR': {
    loading: 'Polindo o vidro…',
    help: 'Ajuda',
    close: 'Fechar',
    controls: 'Controles',
    numbers: 'Números',
    hideUi: 'Esconder interface',
    language: 'Idioma',
    shortcuts: 'Atalhos',
    cinematic: 'Câmeras',
    reset: 'Resetar vista',
    moreSettings: 'Mais ajustes',
    fewerSettings: 'Menos ajustes',
    navigation: 'Navegação da vista',
    experiments: 'Experimentos',
    previousExperiment: 'Experimento anterior',
    nextExperiment: 'Próximo experimento',
    moveUp: 'Mover a vista para cima',
    moveDown: 'Mover a vista para baixo',
    moveLeft: 'Mover a vista para a esquerda',
    moveRight: 'Mover a vista para a direita',
    zoomIn: 'Aproximar',
    zoomOut: 'Afastar',
    pageViewsLabel: 'Visualizações da página',
    instagram: 'Instagram de @juliophisico',
  },
  en: {
    loading: 'Polishing the glass…',
    help: 'Help',
    close: 'Close',
    controls: 'Controls',
    numbers: 'Numbers',
    hideUi: 'Hide interface',
    language: 'Language',
    shortcuts: 'Shortcuts',
    cinematic: 'Cameras',
    reset: 'Reset view',
    moreSettings: 'More settings',
    fewerSettings: 'Fewer settings',
    navigation: 'View navigation',
    experiments: 'Experiments',
    previousExperiment: 'Previous experiment',
    nextExperiment: 'Next experiment',
    moveUp: 'Move the view up',
    moveDown: 'Move the view down',
    moveLeft: 'Move the view left',
    moveRight: 'Move the view right',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    pageViewsLabel: 'Page views',
    instagram: '@juliophisico on Instagram',
  },
} as const;

export type UiString = keyof (typeof STRINGS)['pt-BR'];

export function t(key: UiString, locale: Locale): string {
  return STRINGS[locale][key];
}
