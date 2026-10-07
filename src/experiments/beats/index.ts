import * as THREE from 'three';
import type {
  CinematicShot,
  Experiment,
  ExperimentCopy,
  HudModel,
  LabContext,
  Locale,
  NumberRow,
  PanelSchema,
} from '../../core/experiment';
import {
  INTERVALS,
  type IntervalName,
  type Waveform,
  beatFrequency,
  beatPeriod,
  envelope,
  equalTempered,
  harmonicBeats,
} from '../../optics/acoustics/beats';
import { createEquationPlate } from '../../scene/equation-plate';
import { type ExplainerVideo, mountExplainerVideo } from '../../scene/explainer-video';
import videoPosterUrl from '../../assets/videos/planka-batimentos.jpg?url';
import { formatNumber } from '../../ui/i18n';
import { type BeatsFacts, buildBeatsCopy, describeBeats, formatHz, formatPeriod } from './copy';
import { drawPhasors, drawScope, drawSpectrum } from './displays';
import { BEATS_PLATE } from './equation';
import { type BeatsRig, createBeatsRig } from './instruments';
import { BEATS_RANGES, createBeatsStore } from './state';
import { type Synth, createSynth } from './synth';

/**
 * Experimento "Batimentos" (ADR 0019), na sétima bancada.
 *
 * Um sintetizador de dois osciladores toca (de verdade, pelo Web Audio) as
 * frequências f₁ e f₂; o osciloscópio mostra cada onda e a soma com a
 * envoltória, o monitor mostra o espectro (teórico e medido ao vivo) e a tela
 * redonda, os fasores. O teclado de uma oitava toca notas temperadas.
 */

const WAVEFORMS: readonly Waveform[] = ['sine', 'square', 'sawtooth', 'triangle'];
const INTERVAL_NAMES: readonly IntervalName[] = ['unison', 'third', 'fourth', 'fifth', 'octave'];

const intervalLabel = (name: IntervalName | null, locale: Locale): string => {
  const en = locale === 'en';
  switch (name) {
    case 'unison':
      return en ? 'unison' : 'uníssono';
    case 'third':
      return en ? 'major third' : 'terça maior';
    case 'fourth':
      return en ? 'fourth' : 'quarta';
    case 'fifth':
      return en ? 'fifth' : 'quinta';
    case 'octave':
      return en ? 'octave' : 'oitava';
    default:
      return en ? 'no simple interval' : 'nenhum intervalo simples';
  }
};

export function createBeatsExperiment(): Experiment {
  const store = createBeatsStore();
  let locale: Locale = 'pt-BR';
  let context: LabContext | null = null;
  let explainer: ExplainerVideo | null = null;
  const disposers: (() => void)[] = [];
  const root = new THREE.Group();
  root.name = 'beats';

  let rig: BeatsRig | null = null;
  let synth: Synth | null = null;
  let spectrumData: Float32Array<ArrayBuffer> | null = null;

  const f2Of = (): number => {
    const { f2Base, detune } = store.get();
    return Math.max(20, f2Base + detune);
  };

  /** O intervalo justo mais próximo da razão f₂/f₁ e o desvio, em cents. */
  function nearestInterval(f1: number, f2: number): { name: IntervalName | null; cents: number } {
    const ratio = Math.max(f1, f2) / Math.min(f1, f2);
    let best: IntervalName | null = null;
    let cents = Number.POSITIVE_INFINITY;
    for (const name of INTERVAL_NAMES) {
      const c = 1200 * Math.log2(ratio / INTERVALS[name].just);
      if (Math.abs(c) < Math.abs(cents)) {
        cents = c;
        best = name;
      }
    }
    return Math.abs(cents) <= 60 ? { name: best, cents } : { name: null, cents: Number.NaN };
  }

  // --- Física ------------------------------------------------------------------
  function facts(): BeatsFacts {
    const state = store.get();
    const f1 = state.f1;
    const f2 = f2Of();
    const beat = beatFrequency(f1, f2);
    const { name, cents } = nearestInterval(f1, f2);
    let harmonic: BeatsFacts['harmonic'] = null;
    if (beat >= 30) {
      const pairs = harmonicBeats(
        { frequency: f1, amplitude: state.a1, waveform: state.waveform },
        { frequency: f2, amplitude: state.a2, waveform: state.waveform },
        10,
        25,
      ).filter((pair) => pair.strength > 0.01);
      const first = pairs[0];
      if (first) harmonic = { p: first.p, q: first.q, beat: first.beat };
    }
    return {
      f1,
      f2,
      waveform: state.waveform,
      beat,
      period: beatPeriod(f1, f2),
      harmonic,
      interval: intervalLabel(name, locale),
      cents,
      sound: state.sound === 'on',
    };
  }

  // --- Cena ----------------------------------------------------------------------
  function applyState(): void {
    const state = store.get();
    const f2 = f2Of();
    rig?.setKnobs(state.f1, f2);
    synth?.apply({
      f1: state.f1,
      f2,
      a1: state.a1,
      a2: state.a2,
      waveform: state.waveform,
      volume: state.volume,
      audible: state.sound === 'on',
    });
    // A tecla acesa é a da nota de f₂, se for uma nota temperada sem desafinação.
    let active: number | null = null;
    for (let semitone = -12; semitone <= 0; semitone += 1) {
      if (Math.abs(equalTempered(semitone) - state.f2Base) < 0.01 && state.detune === 0) active = semitone;
    }
    rig?.setActiveKey(active);
    updateLabels();
    context?.invalidate();
  }

  function updateLabels(): void {
    if (!context) return;
    const en = locale === 'en';
    const state = store.get();
    context.labels.setText(
      'bt-synth',
      `${en ? 'Synthesizer' : 'Sintetizador'} · ${formatHz(state.f1, locale)} + ${formatHz(f2Of(), locale)}`,
    );
    context.labels.setText('bt-keyboard', en ? 'Keyboard · A3 to A4 · click' : 'Teclado · lá 3 a lá 4 · clique');
    context.labels.setText(
      'bt-speaker',
      `${en ? 'Speaker' : 'Alto-falante'} · ${state.sound === 'on' ? (en ? 'on' : 'ligado') : en ? 'muted' : 'mudo'}`,
    );
  }

  /** Acorda o sintetizador: só dentro de um gesto (um controle mexido). */
  function wake(): void {
    if (synth && !synth.awake && synth.wake()) applyState();
  }

  const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

  function setF1(f1: number): void {
    const state = store.get();
    // f₂ acompanha f₁ e mantém o intervalo.
    const ratio = state.f2Base / state.f1;
    store.set({ f1, f2Base: f1 * ratio });
  }

  function preset(name: string): void {
    switch (name) {
      case 'beautiful':
        store.set({ f1: 330, f2Base: 330, detune: 1.25, waveform: 'sine', a1: 0.8, a2: 0.8, scope: 'beats' });
        break;
      case 'guitar':
        // Duas cordas no lá (110 Hz), uma desafinada: gire até parar de bater.
        store.set({ f1: 110, f2Base: 110, detune: 3.2, waveform: 'sawtooth', a1: 0.8, a2: 0.8, scope: 'beats' });
        break;
      case 'fifth':
        store.set({ f1: 220, f2Base: equalTempered(-5), detune: 0, waveform: 'sawtooth', a1: 0.8, a2: 0.8, scope: 'waves' });
        break;
      case 'octave':
        store.set({ f1: 220, f2Base: 440, detune: 1, waveform: 'sawtooth', a1: 0.8, a2: 0.8, scope: 'waves' });
        break;
      case 'slow':
        store.set({ f1: 440, f2Base: 440, detune: 0.5, waveform: 'sine', a1: 0.8, a2: 0.8, scope: 'beats' });
        break;
      default:
        break;
    }
  }

  return {
    id: 'beats',
    title: { 'pt-BR': 'Batimentos', en: 'Beats' },

    setup(ctx: LabContext): Promise<void> {
      context = ctx;
      root.position.set(0, ctx.bench.topY, 0);
      ctx.bench.group.add(root);
      disposers.push(() => root.removeFromParent());

      const low = ctx.quality.settings.lightweight || ctx.quality.settings.level === 'low';
      rig = createBeatsRig(ctx.materials, low ? 'low' : 'high');
      root.add(rig.group);
      for (const object of rig.glowing) ctx.addGlow(object);
      synth = createSynth(ctx.audio);

      const equation = createEquationPlate({ spec: BEATS_PLATE, width: ctx.bench.width - 0.3, height: 0.46 });
      equation.mesh.position.set(0, ctx.bench.topY - 0.36, ctx.bench.frontZ + 0.006);
      ctx.bench.group.add(equation.mesh);
      disposers.push(() => {
        equation.mesh.removeFromParent();
        equation.dispose();
      });

      // --- TV do vídeo explicativo da Planka (tecla V) -------------------------
      explainer = mountExplainerVideo(
        ctx,
        {
          file: 'planka-batimentos.mp4',
          poster: videoPosterUrl,
          title: { 'pt-BR': 'Planka e os Batimentos', en: 'Planka and the Beats' },
          description: {
            'pt-BR': 'A Planka mostra por que duas notas quase iguais fazem o som pulsar, com ondas, setinhas que giram e a afinação de um violão.',
            en: 'Planka shows why two nearly equal notes make the sound throb, with waves, spinning arrows and tuning a guitar.',
          },
          position: { x: 0.62, y: ctx.bench.topY, z: ctx.bench.frontZ - 0.12 },
          rotationY: -0.35,
          scale: 0.7,
        },
        locale,
      );
      if (explainer) {
        const mounted = explainer;
        disposers.push(() => {
          mounted.dispose();
          explainer = null;
        });
      }

      const rigRef = rig;
      ctx.labels.add({ id: 'bt-synth', anchor: rigRef.anchors.synth, text: '' });
      ctx.labels.add({ id: 'bt-keyboard', anchor: rigRef.anchors.keyboard, text: '', accent: '#ffd36b' });
      ctx.labels.add({ id: 'bt-speaker', anchor: rigRef.anchors.speaker, text: '', accent: '#8dffcf' });
      disposers.push(() => {
        for (const id of ['bt-synth', 'bt-keyboard', 'bt-speaker']) ctx.labels.remove(id);
      });

      if (ctx.registerClickable) {
        disposers.push(
          ctx.registerClickable({
            targets: rigRef.keys,
            cursor: 'pointer',
            onClick: (hit) => {
              const semitone = Number(hit.object.userData.semitone);
              if (!Number.isFinite(semitone)) return;
              wake();
              store.set({ f2Base: equalTempered(semitone), detune: 0 });
            },
          }),
        );
      }

      const keyed = (action: () => void) => () => {
        wake();
        action();
      };
      disposers.push(
        ctx.onKey('-', keyed(() => setF1(clamp(store.get().f1 / 1.02, BEATS_RANGES.frequency.min, BEATS_RANGES.frequency.max)))),
        ctx.onKey('=', keyed(() => setF1(clamp(store.get().f1 * 1.02, BEATS_RANGES.frequency.min, BEATS_RANGES.frequency.max)))),
        ctx.onKey(
          ',',
          keyed(() =>
            store.set({ detune: clamp(Math.round((store.get().detune - 0.1) * 100) / 100, BEATS_RANGES.detune.min, BEATS_RANGES.detune.max) }),
          ),
        ),
        ctx.onKey(
          '.',
          keyed(() =>
            store.set({ detune: clamp(Math.round((store.get().detune + 0.1) * 100) / 100, BEATS_RANGES.detune.min, BEATS_RANGES.detune.max) }),
          ),
        ),
        ctx.onKey('0', keyed(() => store.set({ detune: 0 }))),
        ctx.onKey(
          't',
          keyed(() => {
            const index = WAVEFORMS.indexOf(store.get().waveform);
            store.set({ waveform: WAVEFORMS[(index + 1) % WAVEFORMS.length]! });
          }),
        ),
        ctx.onKey('m', keyed(() => store.set({ sound: store.get().sound === 'on' ? 'off' : 'on' }))),
        ctx.onKey('z', keyed(() => store.set({ scope: store.get().scope === 'beats' ? 'waves' : 'beats' }))),
      );

      disposers.push(store.subscribe(() => applyState()));
      applyState();
      return Promise.resolve();
    },

    update(_dt: number, elapsed: number): void {
      if (!rig) return;
      const state = store.get();
      const f2 = f2Of();
      const view = { f1: state.f1, f2, a1: state.a1, a2: state.a2, waveform: state.waveform, t: elapsed };
      drawScope(rig.scope.ctx, 1024, 576, view, state.scope, locale);
      rig.scope.refresh();
      const analyser = synth?.analyser ?? null;
      if (analyser) {
        if (spectrumData?.length !== analyser.frequencyBinCount) spectrumData = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatFrequencyData(spectrumData);
      }
      drawSpectrum(
        rig.spectrum.ctx,
        1024,
        576,
        { ...view, measured: analyser ? spectrumData : null, sampleRate: synth?.sampleRate ?? 48000 },
        locale,
      );
      rig.spectrum.refresh();
      drawPhasors(rig.phasor.ctx, 512, 512, view, locale);
      rig.phasor.refresh();

      // LEDs e cone: a envoltória da soma (notas próximas) ou o nível médio.
      const beat = Math.abs(state.f1 - f2);
      const total = Math.max(state.a1 + state.a2, 1e-3);
      const sum = beat < 30 ? envelope(state.a1, state.a2, state.f1, f2, elapsed) / total : 0.7;
      rig.setPulse(state.a1, state.a2, sum * (state.sound === 'on' ? 1 : 0.35));
      // As telas mudam a cada quadro: o loop não dorme.
      context?.invalidate();
    },

    set(id: string, value: string | number | boolean): void {
      // Todo controle é mexido num gesto: é a hora de acordar o áudio.
      if (id !== 'showNumbers') wake();
      switch (id) {
        case 'f1':
          setF1(clamp(Number(value), BEATS_RANGES.frequency.min, BEATS_RANGES.frequency.max));
          break;
        case 'a1':
          store.set({ a1: clamp(Number(value) / 100, 0, 1) });
          break;
        case 'a2':
          store.set({ a2: clamp(Number(value) / 100, 0, 1) });
          break;
        case 'interval':
          if ((INTERVAL_NAMES as readonly string[]).includes(String(value))) {
            store.set({ f2Base: store.get().f1 * INTERVALS[value as IntervalName].just });
          }
          break;
        case 'detune':
          store.set({ detune: clamp(Number(value), BEATS_RANGES.detune.min, BEATS_RANGES.detune.max) });
          break;
        case 'waveform':
          if ((WAVEFORMS as readonly string[]).includes(String(value))) store.set({ waveform: value as Waveform });
          break;
        case 'scope':
          if (value === 'beats' || value === 'waves') store.set({ scope: value });
          break;
        case 'sound':
          if (value === 'on' || value === 'off') store.set({ sound: value });
          break;
        case 'volume':
          store.set({ volume: clamp(Number(value) / 100, 0, 1) });
          break;
        case 'preset':
          preset(String(value));
          break;
        case 'showNumbers':
          store.set({ showNumbers: Boolean(value) });
          break;
        default:
          break;
      }
    },

    get(id: string): string | number | boolean {
      const state = store.get();
      switch (id) {
        case 'f1':
          return state.f1;
        case 'a1':
          return state.a1 * 100;
        case 'a2':
          return state.a2 * 100;
        case 'interval': {
          const ratio = state.f2Base / state.f1;
          return INTERVAL_NAMES.find((name) => Math.abs(INTERVALS[name].just - ratio) < 1e-9) ?? '';
        }
        case 'detune':
          return state.detune;
        case 'waveform':
          return state.waveform;
        case 'scope':
          return state.scope;
        case 'sound':
          return state.sound;
        case 'volume':
          return state.volume * 100;
        case 'showNumbers':
          return state.showNumbers;
        default:
          return 0;
      }
    },

    subscribe(listener: () => void): () => void {
      return store.subscribe(() => listener());
    },

    hud(hudLocale: Locale): HudModel {
      const f = facts();
      const copy = buildBeatsCopy(f);
      const en = hudLocale === 'en';
      const described = describeBeats(f, hudLocale);
      const near = f.beat < 30;
      return {
        title: copy.title[hudLocale],
        subtitle: copy.subtitle[hudLocale],
        chips: [
          { id: 'f1', label: 'f₁', value: formatHz(f.f1, hudLocale) },
          { id: 'f2', label: 'f₂', value: formatHz(f.f2, hudLocale) },
          {
            id: 'beat',
            label: near ? (en ? 'Beat' : 'Batimento') : en ? 'Harmonic beat' : 'Bat. harmônicos',
            value: near ? formatHz(f.beat, hudLocale) : f.harmonic ? formatHz(f.harmonic.beat, hudLocale) : '—',
          },
          {
            id: 'period',
            label: en ? 'Period' : 'Período',
            value: near
              ? formatPeriod(f.period, hudLocale)
              : f.harmonic && f.harmonic.beat > 0
                ? formatPeriod(1 / f.harmonic.beat, hudLocale)
                : '—',
          },
        ],
        sentence: described.sentence,
        highlights: described.highlights,
      };
    },

    numbers(numbersLocale: Locale): NumberRow[] {
      const f = facts();
      const en = numbersLocale === 'en';
      const n = (value: number, decimals: number): string => formatNumber(value, decimals, numbersLocale);
      const state = store.get();
      const rows: NumberRow[] = [
        { id: 'f1', label: en ? 'Oscillator 1, f₁' : 'Oscilador 1, f₁', value: formatHz(f.f1, numbersLocale) },
        { id: 'f2', label: en ? 'Oscillator 2, f₂' : 'Oscilador 2, f₂', value: formatHz(f.f2, numbersLocale) },
        {
          id: 'mean',
          label: en ? 'Carrier (f₁ + f₂)/2' : 'Portadora (f₁ + f₂)/2',
          value: formatHz((f.f1 + f.f2) / 2, numbersLocale),
        },
        { id: 'beat', label: en ? 'Beat frequency' : 'Frequência de batimento', value: formatHz(f.beat, numbersLocale), hint: '|f₁ − f₂|' },
        { id: 'period', label: en ? 'Beat period' : 'Período de batimento', value: formatPeriod(f.period, numbersLocale), hint: '1 / |f₁ − f₂|' },
        {
          id: 'interval',
          label: en ? 'Nearest interval' : 'Intervalo mais próximo',
          value: Number.isFinite(f.cents) ? `${f.interval} · ${f.cents >= 0 ? '+' : '−'}${n(Math.abs(f.cents), 1)} cents` : f.interval,
          hint: en ? 'deviation from the pure (just) ratio' : 'desvio da razão justa (pura)',
        },
        {
          id: 'harmonic',
          label: en ? 'Beat between harmonics' : 'Batimento entre harmônicos',
          value: f.harmonic ? `${f.harmonic.p}·f₁ × ${f.harmonic.q}·f₂: ${formatHz(f.harmonic.beat, numbersLocale)}` : '—',
          hint: '|p·f₁ − q·f₂|',
        },
        {
          id: 'amplitudes',
          label: en ? 'Amplitudes A₁, A₂' : 'Amplitudes A₁, A₂',
          value: `${n(state.a1 * 100, 0)}% · ${n(state.a2 * 100, 0)}%`,
          hint: '√(A₁² + A₂² + 2A₁A₂ cos 2πΔf t)',
        },
      ];
      return rows;
    },

    setLocale(next: Locale): void {
      locale = next;
      explainer?.setLocale(next);
      applyState();
    },

    ui(): PanelSchema {
      const en = locale === 'en';
      return {
        // Aberto, o painel cobriria o espectro e os fasores: começa minimizado.
        startCollapsed: true,
        groups: [
          {
            id: 'osc1',
            label: { 'pt-BR': 'Oscilador 1', en: 'Oscillator 1' },
            hint: { 'pt-BR': '- =', en: '- =' },
            controls: [
              {
                kind: 'slider',
                id: 'f1',
                label: { 'pt-BR': 'Oscilador 1', en: 'Oscillator 1' },
                min: BEATS_RANGES.frequency.min,
                max: BEATS_RANGES.frequency.max,
                step: 0.01,
                logarithmic: true,
                unit: 'Hz',
                decimals: 2,
              },
            ],
          },
          {
            id: 'detune',
            label: { 'pt-BR': 'Desafinação', en: 'Detune' },
            hint: { 'pt-BR': ', . 0', en: ', . 0' },
            controls: [
              {
                kind: 'slider',
                id: 'detune',
                label: { 'pt-BR': 'Desafinação', en: 'Detune' },
                min: BEATS_RANGES.detune.min,
                max: BEATS_RANGES.detune.max,
                step: 0.01,
                unit: 'Hz',
                decimals: 2,
              },
            ],
          },
          {
            id: 'osc2',
            label: { 'pt-BR': 'Oscilador 2 · intervalo', en: 'Oscillator 2 · interval' },
            controls: [
              {
                kind: 'segmented',
                id: 'interval',
                label: { 'pt-BR': 'Oscilador 2 · intervalo', en: 'Oscillator 2 · interval' },
                options: INTERVAL_NAMES.map((name) => ({ value: name, label: intervalLabel(name, locale) })),
              },
            ],
          },
          {
            id: 'amplitudes',
            label: { 'pt-BR': 'Amplitude 1', en: 'Amplitude 1' },
            controls: [
              {
                kind: 'slider',
                id: 'a1',
                label: { 'pt-BR': 'Amplitude 1', en: 'Amplitude 1' },
                min: 0,
                max: 100,
                step: 1,
                unit: '%',
                decimals: 0,
                secondary: true,
              },
              {
                kind: 'slider',
                id: 'a2',
                label: { 'pt-BR': 'Amplitude 2', en: 'Amplitude 2' },
                min: 0,
                max: 100,
                step: 1,
                unit: '%',
                decimals: 0,
                secondary: true,
              },
            ],
          },
          {
            id: 'timbre',
            label: { 'pt-BR': 'Forma de onda · T', en: 'Waveform · T' },
            controls: [
              {
                kind: 'segmented',
                id: 'waveform',
                label: { 'pt-BR': 'Forma de onda · T', en: 'Waveform · T' },
                options: [
                  { value: 'sine', label: en ? 'Sine' : 'Senoidal' },
                  { value: 'square', label: en ? 'Square' : 'Quadrada' },
                  { value: 'sawtooth', label: en ? 'Sawtooth' : 'Serra' },
                  { value: 'triangle', label: en ? 'Triangle' : 'Triangular' },
                ],
              },
            ],
          },
          {
            id: 'sound',
            label: { 'pt-BR': 'Som · M', en: 'Sound · M' },
            controls: [
              {
                kind: 'segmented',
                id: 'sound',
                label: { 'pt-BR': 'Som · M', en: 'Sound · M' },
                options: [
                  { value: 'off', label: en ? 'Muted' : 'Mudo' },
                  { value: 'on', label: en ? 'On' : 'Ligado' },
                ],
              },
              {
                kind: 'slider',
                id: 'volume',
                label: { 'pt-BR': 'Volume', en: 'Volume' },
                min: 0,
                max: 100,
                step: 1,
                unit: '%',
                decimals: 0,
              },
              {
                kind: 'segmented',
                id: 'scope',
                label: { 'pt-BR': 'Osciloscópio · Z', en: 'Oscilloscope · Z' },
                options: [
                  { value: 'beats', label: en ? 'Beats' : 'Batimento' },
                  { value: 'waves', label: en ? 'Waves' : 'Ondas' },
                ],
                secondary: true,
              },
            ],
          },
          {
            id: 'presets',
            label: { 'pt-BR': 'Experimente', en: 'Try this' },
            controls: [
              {
                kind: 'actions',
                id: 'preset',
                label: { 'pt-BR': 'Experimente', en: 'Try this' },
                options: [
                  { value: 'beautiful', label: en ? 'Show me something beautiful' : 'Mostre-me algo bonito', accent: true },
                  { value: 'guitar', label: en ? 'Tune a guitar' : 'Afinar o violão' },
                  { value: 'fifth', label: en ? 'Piano fifth' : 'Quinta do piano' },
                  { value: 'octave', label: en ? 'Detuned octave' : 'Oitava desafinada' },
                  { value: 'slow', label: en ? 'Slow beat' : 'Batimento lento' },
                ],
              },
            ],
          },
        ],
      };
    },

    copy(): ExperimentCopy {
      return buildBeatsCopy(facts());
    },

    cameras(): CinematicShot[] {
      const origin = new THREE.Vector3();
      root.updateWorldMatrix(true, false);
      root.getWorldPosition(origin);
      const { x, y, z } = origin;
      return [
        {
          id: 'overview',
          label: { 'pt-BR': 'Bancada inteira', en: 'Whole bench' },
          position: { x, y: y + 0.78, z: z + 2.7 },
          target: { x, y: y + 0.24, z },
          fov: 40,
          portrait: {
            position: { x: x + 0.45, y: y + 1.05, z: z + 2.9 },
            target: { x: x + 0.1, y: y + 0.25, z },
            fov: 66,
          },
        },
        {
          id: 'scope',
          label: { 'pt-BR': 'O osciloscópio', en: 'The oscilloscope' },
          position: { x: x - 0.16, y: y + 0.4, z: z + 1.05 },
          target: { x: x - 0.16, y: y + 0.31, z: z + 0.1 },
          fov: 40,
        },
        {
          id: 'screens',
          label: { 'pt-BR': 'Espectro e fasores', en: 'Spectrum and phasors' },
          position: { x: x + 0.95, y: y + 0.42, z: z + 1.15 },
          target: { x: x + 0.98, y: y + 0.3, z: z - 0.1 },
          fov: 40,
        },
        {
          id: 'keyboard',
          label: { 'pt-BR': 'O teclado', en: 'The keyboard' },
          position: { x: x - 0.16, y: y + 0.55, z: z + 0.95 },
          target: { x: x - 0.16, y: y + 0.03, z: z + 0.3 },
          fov: 40,
        },
      ];
    },

    dispose(): void {
      synth?.dispose();
      rig?.dispose();
      for (const dispose of disposers) dispose();
      disposers.length = 0;
      root.clear();
      rig = null;
      synth = null;
      spectrumData = null;
      context = null;
    },
  };
}
