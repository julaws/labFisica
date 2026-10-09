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
  return browserLocale();
}

/**
 * Idioma inicial pelo navegador: português para qualquer variante de
 * português (pt-BR, pt-PT, pt), inglês para o resto. A escolha feita no
 * painel, quando houver, vale mais (`preferredLocale`).
 */
export function browserLocale(languages: readonly string[] = navigatorLanguages()): Locale {
  // Na ordem de preferência do navegador, o primeiro idioma que o laboratório
  // fala decide; se nenhum for português nem inglês, fica o inglês.
  for (const language of languages) {
    const code = language.toLowerCase();
    if (code.startsWith('pt')) return 'pt-BR';
    if (code.startsWith('en')) return 'en';
  }
  return 'en';
}

function navigatorLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages.length > 0 ? navigator.languages : [navigator.language];
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
    portraitBack: 'Devolver o quadro à parede',
    photoCredit: 'Foto',
    highQuality: 'Alta qualidade',
    applying: 'Aplicando…',
    highQualityOn: 'ligada — clique para o modo leve, sem sombras, brilhos e texturas finas',
    highQualityOff: 'desligada (modo leve) — clique para religar os efeitos',
    music: 'Música',
    previousTrack: 'Música anterior',
    nextTrack: 'Próxima música',
    mute: 'Silenciar a música',
    unmute: 'Ligar o som da música',
    volume: 'Volume da música',
    musicPausedForVideo: 'Pausada durante o vídeo',
    closeVideo: 'Fechar o vídeo',
    benchVisits: 'VISITAS À BANCADA',
    tour: 'Como usar',
    tourHint: 'Tutorial rápido: onde fica cada controle',
    tourStep: 'Passo',
    tourNext: 'Próximo',
    tourPrevious: 'Anterior',
    tourSkip: 'Pular',
    tourDone: 'Começar a explorar',
    tourControlsTitle: 'Os controles do experimento',
    tourControlsText:
      'No canto superior direito ficam os controles desta bancada: o foco, a abertura, a troca de objetiva e a lente montada ou explodida. O "?" abre a explicação completa e o botão de idioma troca entre português e inglês.',
    tourDockTitle: 'Música e câmera',
    tourDockText:
      'No canto inferior direito, o tocador da música de fundo (pausar, trocar de faixa e volume) e a cruz de navegação: as setas movem a vista, o + e o − aproximam e afastam, e o centro volta à vista padrão. Você também pode arrastar a cena com o mouse ou com o dedo.',
    tourHudTitle: 'A explicação',
    tourHudText:
      'No canto superior esquerdo, o título e uma explicação curta do que está acontecendo. Os números e a frase de baixo mudam a cada ajuste que você faz.',
    tourQualityTitle: 'Alta qualidade',
    tourQualityText:
      'No canto inferior esquerdo, ligue a alta qualidade para ver sombras, brilhos, reflexos e texturas finas. Ela começa desligada para o laboratório rodar bem em qualquer computador ou celular.',
    tourControlsTextTouch:
      'Aqui embaixo, o botão Controles abre a gaveta com os controles desta bancada: o foco, a abertura, a troca de objetiva e a lente montada ou explodida. O "?" abre a explicação completa.',
    tourDockTextTouch:
      'Aqui ficam o tocador da música de fundo (pausar, trocar de faixa e volume) e as visualizações da página. Para mover a câmera, arraste a cena com um dedo; com dois dedos, aproxime e afaste.',
    tourHudTextTouch:
      'No alto da tela, o título e uma explicação curta do que está acontecendo. Os números e a frase de baixo mudam a cada ajuste que você faz.',
    tourQualityTextTouch:
      'Este botão liga a alta qualidade: sombras, brilhos, reflexos e texturas finas. Ela começa desligada para o laboratório rodar bem em qualquer celular.',
    tourSwitcherTextTouch:
      'Aqui você troca de bancada: as setas levam aos outros experimentos (dupla fenda, força magnética, tunelamento, buraco negro, Chladni, batimentos e foguete). A câmera voa até eles.',
    tourSwitcherTitle: 'Outros experimentos',
    tourSwitcherText:
      'No alto, ao centro, escolha outra bancada: dupla fenda, força magnética, tunelamento, buraco negro, figuras de Chladni, batimentos e foguete. A câmera voa até ela.',
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
    portraitBack: 'Put the portrait back on the wall',
    photoCredit: 'Photo',
    highQuality: 'High quality',
    applying: 'Applying…',
    highQualityOn: 'on — click for the light mode, without shadows, glow and fine textures',
    highQualityOff: 'off (light mode) — click to turn the effects back on',
    music: 'Music',
    previousTrack: 'Previous track',
    nextTrack: 'Next track',
    mute: 'Mute the music',
    unmute: 'Unmute the music',
    volume: 'Music volume',
    musicPausedForVideo: 'Paused during the video',
    closeVideo: 'Close the video',
    benchVisits: 'BENCH VISITS',
    tour: 'How to use',
    tourHint: 'Quick tour: where each control is',
    tourStep: 'Step',
    tourNext: 'Next',
    tourPrevious: 'Back',
    tourSkip: 'Skip',
    tourDone: 'Start exploring',
    tourControlsTitle: 'The experiment controls',
    tourControlsText:
      'The top right corner holds the controls of this bench: focus, aperture, lens choice and assembled or exploded lens. The "?" opens the full explanation and the language button switches between Portuguese and English.',
    tourDockTitle: 'Music and camera',
    tourDockText:
      'In the bottom right corner, the background music player (pause, change track, volume) and the navigation pad: the arrows move the view, + and − zoom in and out, and the centre returns to the default view. You can also drag the scene with the mouse or a finger.',
    tourHudTitle: 'The explanation',
    tourHudText:
      'In the top left corner, the title and a short explanation of what is going on. The numbers and the sentence below change with every adjustment you make.',
    tourQualityTitle: 'High quality',
    tourQualityText:
      'In the bottom left corner, turn on high quality to see shadows, glow, reflections and fine textures. It starts off so the lab runs well on any computer or phone.',
    tourControlsTextTouch:
      'Down here, the Controls button opens the drawer with this bench’s controls: focus, aperture, lens choice and assembled or exploded lens. The "?" opens the full explanation.',
    tourDockTextTouch:
      'Here are the background music player (pause, change track, volume) and the page views. To move the camera, drag the scene with one finger; pinch with two to zoom.',
    tourHudTextTouch:
      'At the top of the screen, the title and a short explanation of what is going on. The numbers and the sentence below change with every adjustment you make.',
    tourQualityTextTouch:
      'This button turns on high quality: shadows, glow, reflections and fine textures. It starts off so the lab runs well on any phone.',
    tourSwitcherTextTouch:
      'Switch benches here: the arrows lead to the other experiments (double slit, magnetic force, tunnelling, black hole, Chladni, beats and rocket). The camera flies there.',
    tourSwitcherTitle: 'Other experiments',
    tourSwitcherText:
      'At the top centre, pick another bench: double slit, magnetic force, tunnelling, black hole, Chladni figures, beats and rocket. The camera flies there.',
  },
} as const;

export type UiString = keyof (typeof STRINGS)['pt-BR'];

export function t(key: UiString, locale: Locale): string {
  return STRINGS[locale][key];
}
