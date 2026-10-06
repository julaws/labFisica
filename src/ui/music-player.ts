import { type Locale, t } from './i18n';

/**
 * Música de fundo do laboratório, no canto inferior direito, ao lado da
 * navegação: faixa anterior, mudo, próxima e volume.
 *
 * - As faixas tocam em sequência e voltam ao começo da lista no fim.
 * - O volume começa em 10%. O navegador só deixa tocar som depois de um gesto
 *   da pessoa: a música começa no primeiro clique, toque ou tecla na página.
 * - As gravações são de domínio público (CREDITS.md) e chegam com volumes
 *   muito diferentes (de −15 a −35 dBFS de média). Cada faixa leva um ganho
 *   que a traz para −26 dBFS, medido uma vez nos arquivos; nenhuma passa de
 *   −4 dBFS de pico com o ganho.
 * - O volume passa por um GainNode (Web Audio): no iPhone, `audio.volume` é
 *   só leitura. Sem Web Audio, cai para `audio.volume`.
 * - Volume, mudo e faixa ficam guardados no navegador de quem visita, quando
 *   ele deixa.
 * - Só a faixa atual é baixada, aos poucos (`preload = none` até tocar).
 * - `setSuspended(true)` cala a música enquanto outro som toca (o vídeo
 *   explicativo) e `setSuspended(false)` a retoma de onde parou, sem mexer no
 *   volume nem no mudo escolhidos pela pessoa.
 */

export interface Track {
  readonly file: string;
  readonly title: Readonly<Record<Locale, string>>;
  /** Ganho de nivelamento, dB. */
  readonly gainDb: number;
}

export const TRACKS: readonly Track[] = [
  {
    file: 'bach-air.mp3',
    title: { 'pt-BR': 'Bach · Ária na Corda Sol', en: 'Bach · Air on the G String' },
    gainDb: -11.0,
  },
  {
    file: 'beethoven-moonlight-1.mp3',
    title: { 'pt-BR': 'Beethoven · Sonata ao Luar, 1º mov.', en: 'Beethoven · Moonlight Sonata, 1st mvt.' },
    gainDb: 8.7,
  },
  {
    file: 'debussy-clair-de-lune.mp3',
    title: { 'pt-BR': 'Debussy · Clair de Lune', en: 'Debussy · Clair de Lune' },
    gainDb: -0.2,
  },
  {
    file: 'satie-gymnopedie-1.mp3',
    title: { 'pt-BR': 'Satie · Gymnopédie nº 1', en: 'Satie · Gymnopédie No. 1' },
    gainDb: 2.9,
  },
  {
    file: 'mozart-k333-andante.mp3',
    title: { 'pt-BR': 'Mozart · Sonata K. 333, Andante', en: 'Mozart · Sonata K. 333, Andante' },
    gainDb: 6.2,
  },
];

export interface MusicPlayer {
  readonly element: HTMLElement;
  /** Cala a música (fade curto e pausa) até ser liberada de novo. */
  setSuspended(suspended: boolean): void;
  setLocale(locale: Locale): void;
  dispose(): void;
}

export interface MusicPlayerOptions {
  readonly parent: HTMLElement;
  readonly locale: Locale;
  /** Pasta das faixas, com a barra no fim. */
  readonly baseUrl: string;
}

const STORAGE_KEY = 'optics-lab:music';
const DEFAULT_VOLUME = 0.1;

interface Saved {
  volume: number;
  muted: boolean;
  track: number;
}

function loadSaved(): Saved {
  const fallback: Saved = { volume: DEFAULT_VOLUME, muted: false, track: 0 };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw) as Partial<Saved>;
    return {
      volume: typeof data.volume === 'number' && data.volume >= 0 && data.volume <= 1 ? data.volume : fallback.volume,
      muted: data.muted === true,
      track: typeof data.track === 'number' && data.track >= 0 && data.track < TRACKS.length ? Math.floor(data.track) : 0,
    };
  } catch {
    return fallback;
  }
}

function save(state: Saved): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Só uma preferência: sem armazenamento, a música volta ao padrão.
  }
}

const icon = (path: string): string => `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${path}"/></svg>`;
const PREV_ICON = icon('M3.2 3h1.6v10H3.2zM13.2 3.4v9.2L5.6 8z');
const NEXT_ICON = icon('M11.2 3h1.6v10h-1.6zM2.8 3.4v9.2L10.4 8z');
const SPEAKER = 'M2 6h2.6L8 3.2v9.6L4.6 10H2z';
const SOUND_ICON = icon(
  `${SPEAKER}M10.3 5.2a3.6 3.6 0 0 1 0 5.6l-.9-1a2.3 2.3 0 0 0 0-3.6zM12.1 3.4a6.1 6.1 0 0 1 0 9.2l-.9-1a4.8 4.8 0 0 0 0-7.2z`,
);
const MUTED_ICON = icon(`${SPEAKER}M10 5.9l.9-.9 1.6 1.6 1.6-1.6.9.9L13.4 7.5l1.6 1.6-.9.9-1.6-1.6-1.6 1.6-.9-.9 1.6-1.6z`);
const NOTE_ICON = icon('M6 2.5v7.6a2.2 2.2 0 1 0 1.4 2V5.2l5.2-1.3v4.9a2.2 2.2 0 1 0 1.4 2V1z');

export function createMusicPlayer({ parent, locale: initialLocale, baseUrl }: MusicPlayerOptions): MusicPlayer {
  let locale = initialLocale;
  const state = loadSaved();
  let started = false;
  let suspended = false;

  const audio = new Audio();
  audio.preload = 'none';
  audio.crossOrigin = 'anonymous';

  // Web Audio, criado no primeiro gesto (antes dele o contexto nasce suspenso).
  let context: AudioContext | null = null;
  let gain: GainNode | null = null;

  const trackGain = (): number => 10 ** ((TRACKS[state.track]?.gainDb ?? 0) / 20);

  const applyVolume = (): void => {
    const level = state.muted || suspended ? 0 : state.volume * trackGain();
    if (gain && context) gain.gain.setTargetAtTime(level, context.currentTime, 0.05);
    else audio.volume = Math.min(1, level);
  };

  const element = document.createElement('div');
  element.className = 'music';
  element.setAttribute('role', 'group');

  const title = document.createElement('p');
  title.className = 'music__title';
  title.innerHTML = NOTE_ICON;
  const titleText = document.createElement('span');
  title.appendChild(titleText);

  const controls = document.createElement('div');
  controls.className = 'music__controls';
  const button = (className: string): HTMLButtonElement => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `music__button ${className}`;
    controls.appendChild(item);
    return item;
  };
  const prev = button('music__prev');
  prev.innerHTML = PREV_ICON;
  const mute = button('music__mute');
  const next = button('music__next');
  next.innerHTML = NEXT_ICON;
  const volume = document.createElement('input');
  volume.type = 'range';
  volume.className = 'music__volume';
  volume.min = '0';
  volume.max = '100';
  volume.step = '1';
  controls.appendChild(volume);

  element.append(title, controls);
  parent.prepend(element);

  const render = (): void => {
    const track = TRACKS[state.track];
    titleText.textContent = suspended ? t('musicPausedForVideo', locale) : track ? track.title[locale] : '';
    element.classList.toggle('music--suspended', suspended);
    element.title = track ? `${t('music', locale)}: ${track.title[locale]}` : t('music', locale);
    element.setAttribute('aria-label', t('music', locale));
    prev.title = t('previousTrack', locale);
    prev.setAttribute('aria-label', t('previousTrack', locale));
    next.title = t('nextTrack', locale);
    next.setAttribute('aria-label', t('nextTrack', locale));
    const muteLabel = t(state.muted ? 'unmute' : 'mute', locale);
    mute.title = muteLabel;
    mute.setAttribute('aria-label', muteLabel);
    mute.setAttribute('aria-pressed', String(state.muted));
    mute.innerHTML = state.muted || state.volume === 0 ? MUTED_ICON : SOUND_ICON;
    volume.value = String(Math.round(state.volume * 100));
    volume.setAttribute('aria-label', t('volume', locale));
    volume.title = `${t('volume', locale)}: ${volume.value}%`;
    volume.style.setProperty('--fill', `${volume.value}%`);
  };

  const play = (): void => {
    if (!started || state.muted || suspended) return;
    void context?.resume();
    audio.play().catch(() => {
      // Bloqueado (sem gesto) ou sem rede: tenta de novo no próximo gesto.
      started = false;
    });
  };

  const loadTrack = (index: number): void => {
    state.track = ((index % TRACKS.length) + TRACKS.length) % TRACKS.length;
    const track = TRACKS[state.track];
    if (!track) return;
    audio.src = `${baseUrl}${track.file}`;
    applyVolume();
    save(state);
    render();
  };

  const step = (direction: number): void => {
    loadTrack(state.track + direction);
    play();
  };

  // Começa no primeiro gesto da pessoa em qualquer lugar da página.
  const start = (): void => {
    if (started) return;
    started = true;
    if (!context) {
      try {
        const Context = window.AudioContext;
        context = new Context();
        gain = context.createGain();
        context.createMediaElementSource(audio).connect(gain).connect(context.destination);
        // Daqui em diante quem controla o volume é o GainNode.
        audio.volume = 1;
      } catch {
        context = null;
        gain = null;
      }
    }
    applyVolume();
    play();
  };
  const gestures = ['pointerdown', 'keydown', 'touchstart'] as const;
  for (const name of gestures) window.addEventListener(name, start, { capture: true, passive: true });

  audio.addEventListener('ended', () => step(1));
  // Arquivo com problema: pula para a próxima, sem ficar em silêncio.
  audio.addEventListener('error', () => {
    if (started && audio.src) window.setTimeout(() => step(1), 1500);
  });
  audio.addEventListener('playing', () => {
    audio.preload = 'auto';
  });

  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  mute.addEventListener('click', () => {
    state.muted = !state.muted;
    // Tirar do mudo com o volume em zero devolve o volume padrão.
    if (!state.muted && state.volume === 0) state.volume = DEFAULT_VOLUME;
    applyVolume();
    if (state.muted) audio.pause();
    else play();
    save(state);
    render();
  });
  volume.addEventListener('input', () => {
    state.volume = Number(volume.value) / 100;
    if (state.muted && state.volume > 0) {
      state.muted = false;
      play();
    }
    applyVolume();
    save(state);
    render();
  });
  // As teclas de atalho do laboratório não devem mexer na música por engano.
  volume.addEventListener('keydown', (event) => event.stopPropagation());

  loadTrack(state.track);

  let pauseTimer = 0;
  const setSuspended = (next: boolean): void => {
    if (suspended === next) return;
    suspended = next;
    window.clearTimeout(pauseTimer);
    applyVolume();
    // Pausa depois do fade: o áudio fica parado no lugar, sem gastar rede.
    if (suspended) pauseTimer = window.setTimeout(() => audio.pause(), 250);
    else play();
    render();
  };

  return {
    element,
    setSuspended,
    setLocale(next: Locale): void {
      locale = next;
      render();
    },
    dispose(): void {
      for (const name of gestures) window.removeEventListener(name, start, { capture: true });
      window.clearTimeout(pauseTimer);
      audio.pause();
      audio.removeAttribute('src');
      void context?.close();
      element.remove();
    },
  };
}
