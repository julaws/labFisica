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
  CIRCLE_PLATE,
  DEFAULT_Q,
  type Plate,
  type PlateField,
  type PlateMode,
  type PlateResponse,
  SQUARE_PLATE,
  nodalLineCount,
  plateField,
  plateModes,
  plateResponse,
  plateStiffness,
  scatterSand,
  seededRandom,
  stepSand,
} from '../../optics/acoustics/chladni';
import { createEquationPlate } from '../../scene/equation-plate';
import { formatNumber } from '../../ui/i18n';
import { type ChladniFacts, buildChladniCopy, describeChladni, formatHz, formatMode } from './copy';
import { CHLADNI_PLATE } from './equation';
import { type Generator, createGenerator } from './generator';
import { DRAW_SCALE, type PlateRig, createPlateRig } from './plate';
import { CHLADNI_RANGES, SAND_AMOUNTS, createChladniStore } from './state';
import { type Tone, createTone } from './tone';

/**
 * Experimento "Figuras de Chladni" (ADR 0018), na sexta bancada.
 *
 * Uma placa de aço num excitador, o gerador de funções ao lado e areia por
 * cima. A resposta da placa (soma de osciladores amortecidos, um por modo)
 * vem do motor; a areia pula onde a placa acelera mais que a gravidade e se
 * junta nas linhas nodais. O som, opcional, é a frequência de verdade.
 */

const MAX_FREQUENCY = 4300;
/** Varredura: uma oitava a cada 6 s, parando 3,5 s em cada ressonância. */
const SWEEP_OCTAVE_SECONDS = 6;
const SWEEP_DWELL = 3.5;
const SWEEP_FROM = 60;
const SWEEP_TO = 3000;

export function createChladniExperiment(): Experiment {
  const store = createChladniStore();
  let locale: Locale = 'pt-BR';
  let context: LabContext | null = null;
  const disposers: (() => void)[] = [];
  const root = new THREE.Group();
  root.name = 'chladni';

  let rig: PlateRig | null = null;
  let generator: Generator | null = null;
  let tone: Tone | null = null;

  const modesByShape = new Map<string, PlateMode[]>();
  const modesFor = (plate: Plate): PlateMode[] => {
    let modes = modesByShape.get(plate.shape);
    if (!modes) {
      modes = plateModes(plate, MAX_FREQUENCY);
      modesByShape.set(plate.shape, modes);
    }
    return modes;
  };
  const nodalCache = new Map<PlateMode, number>();
  const nodalLines = (mode: PlateMode, plate: Plate): number => {
    let count = nodalCache.get(mode);
    if (count === undefined) {
      count = nodalLineCount(mode, plate.size);
      nodalCache.set(mode, count);
    }
    return count;
  };

  const random = seededRandom(20261007);
  let sand: Float32Array = new Float32Array(0);
  let response: PlateResponse | null = null;
  let field: PlateField | null = null;
  let fieldDirty = true;
  let sweepDwell = 0;

  const plateOf = (): Plate => (store.get().shape === 'square' ? SQUARE_PLATE : CIRCLE_PLATE);
  const drive = (): number => {
    const { frequency, fine } = store.get();
    return Math.min(Math.max(frequency + fine, 20), MAX_FREQUENCY);
  };

  // --- Física ------------------------------------------------------------------
  function currentResponse(): PlateResponse {
    const f = drive();
    if (!response || response.frequency !== f || response.modes[0]?.mode.shape !== plateOf().shape) {
      response = plateResponse(modesFor(plateOf()), f);
    }
    return response;
  }

  function nearestMode(frequency: number): PlateMode | null {
    let best: PlateMode | null = null;
    let gap = Number.POSITIVE_INFINITY;
    for (const mode of modesFor(plateOf())) {
      const distance = Math.abs(Math.log(mode.frequency / frequency));
      if (distance < gap) {
        gap = distance;
        best = mode;
      }
    }
    return best;
  }

  function facts(): ChladniFacts {
    const state = store.get();
    const plate = plateOf();
    const r = currentResponse();
    const dominant = r.strength > 0.02 ? r.dominant : null;
    const nearest = nearestMode(r.frequency);
    return {
      shape: state.shape,
      frequency: r.frequency,
      mode: dominant,
      strength: r.strength,
      resonant: r.resonant,
      nodalLines: dominant ? nodalLines(dominant, plate) : 0,
      nearest,
      q: DEFAULT_Q,
      halfWidth: nearest ? nearest.frequency / (2 * DEFAULT_Q) : 0,
      size: plate.size,
      sand: state.sand,
    };
  }

  // --- Cena ----------------------------------------------------------------------
  function scatter(): void {
    const state = store.get();
    sand = scatterSand(state.sand, plateOf(), random);
    rig?.setSand(sand);
  }

  let lastShape = store.get().shape;
  let lastSand = store.get().sand;

  function applyState(): void {
    const state = store.get();
    const plate = plateOf();
    rig?.setShape(state.shape, plate.size);
    if (state.shape !== lastShape || state.sand !== lastSand || sand.length === 0) {
      lastShape = state.shape;
      lastSand = state.sand;
      response = null;
      scatter();
    }
    fieldDirty = true;
    const f = facts();
    tone?.setEnabled(state.sound === 'on');
    tone?.setFrequency(f.frequency);
    tone?.setLevel(f.strength);
    showGenerator(f);
    updateLabels(f);
    context?.invalidate();
  }

  function showGenerator(f: ChladniFacts): void {
    const en = locale === 'en';
    const state = store.get();
    generator?.show({
      frequency: formatHz(f.frequency, locale),
      mode: f.resonant
        ? `${en ? 'MODE' : 'MODO'} ${formatMode(f.mode)} · ${f.nodalLines} ${en ? 'NODAL LINES' : 'LINHAS NODAIS'}`
        : en
          ? 'BETWEEN MODES'
          : 'ENTRE MODOS',
      resonance: f.strength,
      status: `${en ? 'SOUND' : 'SOM'} ${state.sound === 'on' ? (en ? 'ON' : 'LIGADO') : en ? 'MUTED' : 'MUDO'}${
        state.sweep === 'on' ? (en ? ' · SWEEP' : ' · VARREDURA') : ''
      }`,
    });
  }

  function updateLabels(f: ChladniFacts): void {
    if (!context) return;
    const en = locale === 'en';
    const plateName =
      f.shape === 'square'
        ? `${en ? 'Steel plate' : 'Placa de aço'} · ${formatNumber(f.size * 100, 0, locale)} cm`
        : `${en ? 'Round plate' : 'Placa redonda'} · ⌀ ${formatNumber(f.size * 200, 0, locale)} cm`;
    context.labels.setText(
      'ch-plate',
      `${plateName} · ${f.resonant ? `${en ? 'mode' : 'modo'} ${formatMode(f.mode)}` : en ? 'between modes' : 'entre modos'}`,
    );
    context.labels.setText('ch-generator', `${en ? 'Generator' : 'Gerador'} · ${formatHz(f.frequency, locale)}`);
  }

  function goToMode(mode: PlateMode | undefined): void {
    if (!mode) return;
    store.set({ frequency: mode.frequency, fine: 0, sweep: 'off' });
  }

  function stepMode(direction: 1 | -1): void {
    const modes = modesFor(plateOf());
    const f = drive();
    const next =
      direction > 0
        ? modes.find((mode) => mode.frequency > f * 1.001)
        : [...modes].reverse().find((mode) => mode.frequency < f * 0.999);
    goToMode(next ?? (direction > 0 ? modes.at(-1) : modes[0]));
  }

  function selectMode(n: number, m: number): void {
    const modes = modesFor(plateOf());
    let target = modes.find((mode) => mode.n === n && mode.m === m);
    if (!target && plateOf().shape === 'square') {
      // (n, m) e (m, n) são o mesmo modo; n = m não existe nessa família.
      target = modes.find((mode) => mode.n === Math.min(n, m) && mode.m === Math.max(n, m));
      target ??= modes.find((mode) => mode.n === n && mode.m === n + 1);
    }
    goToMode(target);
  }

  function preset(name: string): void {
    switch (name) {
      case 'beautiful': {
        // Placa redonda, quatro diâmetros e três círculos: uma mandala de areia.
        store.set({ shape: 'circle', sweep: 'off' });
        const mode = modesFor(CIRCLE_PLATE).find((m) => m.n === 4 && m.m === 3);
        goToMode(mode);
        scatter();
        break;
      }
      case 'scatter':
        scatter();
        break;
      case 'previous':
        stepMode(-1);
        break;
      case 'next':
        stepMode(1);
        break;
      default:
        break;
    }
  }

  const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

  return {
    id: 'chladni',
    title: { 'pt-BR': 'Figuras de Chladni', en: 'Chladni figures' },

    setup(ctx: LabContext): Promise<void> {
      context = ctx;
      const { materials } = ctx;
      root.position.set(0, ctx.bench.topY, 0);
      ctx.bench.group.add(root);
      disposers.push(() => root.removeFromParent());

      rig = createPlateRig(materials);
      rig.group.position.set(-0.28, 0, -0.04);
      root.add(rig.group);
      for (const object of rig.glowing) ctx.addGlow(object);

      // O cabo vai até a base do excitador, no referencial do gerador.
      const generatorPosition = new THREE.Vector3(0.98, 0, 0.12);
      const generatorRotation = -0.42;
      const exciter = new THREE.Vector3(-0.28 + 0.13, 0.03, -0.04).sub(generatorPosition);
      exciter.applyAxisAngle(new THREE.Vector3(0, 1, 0), -generatorRotation);
      generator = createGenerator(materials, exciter);
      generator.group.position.copy(generatorPosition);
      generator.group.rotation.y = generatorRotation;
      root.add(generator.group);
      for (const object of generator.glowing) ctx.addGlow(object);

      tone = createTone(ctx.audio);

      const equation = createEquationPlate({ spec: CHLADNI_PLATE, width: ctx.bench.width - 0.3, height: 0.46 });
      equation.mesh.position.set(0, ctx.bench.topY - 0.36, ctx.bench.frontZ + 0.006);
      ctx.bench.group.add(equation.mesh);
      disposers.push(() => {
        equation.mesh.removeFromParent();
        equation.dispose();
      });

      const rigRef = rig;
      const generatorRef = generator;
      ctx.labels.add({ id: 'ch-plate', anchor: rigRef.center, offset: { x: 0, y: 0.12, z: -0.42 }, text: '' });
      ctx.labels.add({
        id: 'ch-generator',
        anchor: generatorRef.display,
        offset: { x: 0, y: 0.16, z: 0 },
        text: '',
        accent: '#8dffcf',
      });
      disposers.push(() => {
        ctx.labels.remove('ch-plate');
        ctx.labels.remove('ch-generator');
      });

      const scaleFrequency = (factor: number): void =>
        store.set({
          frequency: clamp(store.get().frequency * factor, CHLADNI_RANGES.frequency.min, CHLADNI_RANGES.frequency.max),
          sweep: 'off',
        });
      const nudgeFine = (delta: number): void =>
        store.set({
          fine: clamp(Math.round((store.get().fine + delta) * 10) / 10, CHLADNI_RANGES.fine.min, CHLADNI_RANGES.fine.max),
        });
      disposers.push(
        ctx.onKey('[', () => stepMode(-1)),
        ctx.onKey(']', () => stepMode(1)),
        ctx.onKey('-', () => scaleFrequency(1 / 1.02)),
        ctx.onKey('=', () => scaleFrequency(1.02)),
        ctx.onKey(',', () => nudgeFine(-0.5)),
        ctx.onKey('.', () => nudgeFine(0.5)),
        ctx.onKey('f', () => store.set({ shape: store.get().shape === 'square' ? 'circle' : 'square' })),
        ctx.onKey('b', () => scatter()),
        ctx.onKey('m', () => store.set({ sound: store.get().sound === 'on' ? 'off' : 'on' })),
        ctx.onKey('n', () => store.set({ sweep: store.get().sweep === 'on' ? 'off' : 'on' })),
      );

      disposers.push(store.subscribe(() => applyState()));
      applyState();
      return Promise.resolve();
    },

    update(dt: number, elapsed: number): void {
      const state = store.get();
      if (state.sweep === 'on') {
        if (sweepDwell > 0) sweepDwell -= dt;
        else {
          const from = state.frequency;
          let next = from * 2 ** (dt / SWEEP_OCTAVE_SECONDS);
          // Parou numa ressonância no caminho?
          const crossed = modesFor(plateOf()).find((mode) => mode.frequency > from && mode.frequency <= next);
          if (crossed) {
            next = crossed.frequency;
            sweepDwell = SWEEP_DWELL;
          }
          if (next > SWEEP_TO) next = SWEEP_FROM;
          store.set({ frequency: next, fine: 0 });
        }
      }

      if (fieldDirty) {
        // Na varredura a grade muda a cada quadro: mais grossa, mais barata.
        field = plateField(currentResponse(), plateOf(), state.sweep === 'on' ? 64 : 96);
        rig?.setField(field);
        fieldDirty = false;
      }
      if (field && sand.length > 0) {
        const steps = Math.min(3, Math.max(1, Math.round(dt * 60)));
        for (let i = 0; i < steps; i += 1) stepSand(sand, field.amplitudeAt, plateOf(), random);
      }
      rig?.update(elapsed);
      // A placa vibra e a areia pula: o loop não dorme.
      context?.invalidate();
    },

    set(id: string, value: string | number | boolean): void {
      switch (id) {
        case 'frequency':
          store.set({
            frequency: clamp(Number(value), CHLADNI_RANGES.frequency.min, CHLADNI_RANGES.frequency.max),
            sweep: 'off',
          });
          break;
        case 'fine':
          store.set({ fine: clamp(Number(value), CHLADNI_RANGES.fine.min, CHLADNI_RANGES.fine.max) });
          break;
        case 'modeN':
          selectMode(Math.round(Number(value)), facts().nearest?.m ?? 1);
          break;
        case 'modeM':
          selectMode(facts().nearest?.n ?? 0, Math.round(Number(value)));
          break;
        case 'shape':
          if (value === 'square' || value === 'circle') store.set({ shape: value });
          break;
        case 'sand': {
          const amount = Number(value);
          if ((SAND_AMOUNTS as readonly number[]).includes(amount)) store.set({ sand: amount });
          break;
        }
        case 'sound':
          if (value === 'on' || value === 'off') store.set({ sound: value });
          break;
        case 'sweep':
          if (value === 'on' || value === 'off') store.set({ sweep: value, fine: 0 });
          break;
        case 'action':
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
        case 'frequency':
          return state.frequency;
        case 'fine':
          return state.fine;
        case 'modeN':
          return facts().nearest?.n ?? 0;
        case 'modeM':
          return facts().nearest?.m ?? 1;
        case 'shape':
          return state.shape;
        case 'sand':
          return state.sand;
        case 'sound':
          return state.sound;
        case 'sweep':
          return state.sweep;
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
      const copy = buildChladniCopy(f);
      const en = hudLocale === 'en';
      const described = describeChladni(f, hudLocale);
      return {
        title: copy.title[hudLocale],
        subtitle: copy.subtitle[hudLocale],
        chips: [
          { id: 'frequency', label: en ? 'Frequency' : 'Frequência', value: formatHz(f.frequency, hudLocale) },
          { id: 'mode', label: en ? 'Mode' : 'Modo', value: f.resonant ? formatMode(f.mode) : '—' },
          { id: 'nodal', label: en ? 'Nodal lines' : 'Linhas nodais', value: f.resonant ? String(f.nodalLines) : '—' },
          {
            id: 'resonance',
            label: en ? 'Resonance' : 'Ressonância',
            value: `${formatNumber(Math.min(f.strength, 1) * 100, 0, hudLocale)}%`,
          },
        ],
        sentence: described.sentence,
        highlights: described.highlights,
      };
    },

    numbers(numbersLocale: Locale): NumberRow[] {
      const f = facts();
      const en = numbersLocale === 'en';
      const plate = plateOf();
      const n = (value: number, decimals: number): string => formatNumber(value, decimals, numbersLocale);
      return [
        { id: 'frequency', label: en ? 'Drive frequency' : 'Frequência do excitador', value: formatHz(f.frequency, numbersLocale) },
        {
          id: 'nearest',
          label: en ? 'Nearest mode' : 'Modo mais próximo',
          value: f.nearest ? `${formatMode(f.nearest)} · ${formatHz(f.nearest.frequency, numbersLocale)}` : '—',
          hint: plate.shape === 'square' ? 'f = π(n² + m²)/(2L²) · √(D/ρh)' : 'f = (j_ns/a)² · √(D/ρh) / 2π',
        },
        {
          id: 'amplitude',
          label: en ? 'Amplitude (peak = 100%)' : 'Amplitude (pico = 100%)',
          value: `${n(Math.min(f.strength, 1) * 100, 1)}%`,
          hint: '1 / (Q·√((1 − r²)² + (r/Q)²))',
        },
        { id: 'q', label: en ? 'Quality factor Q' : 'Fator de qualidade Q', value: n(f.q, 0) },
        {
          id: 'width',
          label: en ? 'Resonance half-width' : 'Meia largura da ressonância',
          value: `${n(f.halfWidth, 2)} Hz`,
          hint: 'f₀ / 2Q',
        },
        {
          id: 'k',
          label: en ? 'Wave number k' : 'Número de onda k',
          value: f.nearest ? `${n(f.nearest.k, 1)} m⁻¹` : '—',
        },
        {
          id: 'stiffness',
          label: '√(D/ρh)',
          value: `${n(plateStiffness(plate), 3)} m²/s`,
          hint: 'D = Eh³ / 12(1 − ν²)',
        },
        {
          id: 'plate',
          label: en ? 'Plate' : 'Placa',
          value:
            plate.shape === 'square'
              ? `${n(plate.size * 100, 0)} cm × ${n(plate.thickness * 1000, 1)} mm`
              : `⌀ ${n(plate.size * 200, 0)} cm × ${n(plate.thickness * 1000, 1)} mm`,
          hint: en ? 'steel: E = 200 GPa, ρ = 7850 kg/m³, ν = 0.29' : 'aço: E = 200 GPa, ρ = 7850 kg/m³, ν = 0,29',
        },
        { id: 'sand', label: en ? 'Sand grains' : 'Grãos de areia', value: n(f.sand, 0) },
      ];
    },

    setLocale(next: Locale): void {
      locale = next;
      applyState();
    },

    ui(): PanelSchema {
      const en = locale === 'en';
      const square = store.get().shape === 'square';
      return {
        groups: [
          {
            id: 'frequency',
            label: { 'pt-BR': 'Frequência', en: 'Frequency' },
            hint: { 'pt-BR': '- =', en: '- =' },
            controls: [
              {
                kind: 'slider',
                id: 'frequency',
                label: { 'pt-BR': 'Frequência', en: 'Frequency' },
                min: CHLADNI_RANGES.frequency.min,
                max: CHLADNI_RANGES.frequency.max,
                step: 0.1,
                logarithmic: true,
                unit: 'Hz',
                decimals: 1,
              },
              {
                kind: 'slider',
                id: 'fine',
                label: { 'pt-BR': 'Sintonia fina', en: 'Fine tuning' },
                min: CHLADNI_RANGES.fine.min,
                max: CHLADNI_RANGES.fine.max,
                step: 0.1,
                unit: 'Hz',
                decimals: 1,
              },
            ],
          },
          {
            id: 'mode',
            label: { 'pt-BR': 'Modo n', en: 'Mode n' },
            hint: { 'pt-BR': '[ ]', en: '[ ]' },
            controls: [
              {
                kind: 'slider',
                id: 'modeN',
                label: { 'pt-BR': 'Modo n', en: 'Mode n' },
                min: 0,
                max: square ? 9 : 8,
                step: 1,
                unit: square ? '' : en ? 'diam.' : 'diâm.',
                decimals: 0,
              },
              {
                kind: 'slider',
                id: 'modeM',
                label: { 'pt-BR': 'Modo m', en: 'Mode m' },
                min: 1,
                max: square ? 10 : 6,
                step: 1,
                unit: square ? '' : en ? 'circ.' : 'círc.',
                decimals: 0,
              },
            ],
          },
          {
            id: 'plate',
            label: { 'pt-BR': 'Placa · F', en: 'Plate · F' },
            controls: [
              {
                kind: 'segmented',
                id: 'shape',
                label: { 'pt-BR': 'Placa · F', en: 'Plate · F' },
                options: [
                  { value: 'square', label: en ? 'Square' : 'Quadrada' },
                  { value: 'circle', label: en ? 'Round' : 'Redonda' },
                ],
              },
              {
                kind: 'segmented',
                id: 'sand',
                label: { 'pt-BR': 'Areia', en: 'Sand' },
                options: SAND_AMOUNTS.map((amount) => ({
                  value: amount,
                  label: en ? `${amount / 1000}k` : `${amount / 1000} mil`,
                })),
                secondary: true,
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
                kind: 'segmented',
                id: 'sweep',
                label: { 'pt-BR': 'Varredura · N', en: 'Sweep · N' },
                options: [
                  { value: 'off', label: en ? 'Off' : 'Parada' },
                  { value: 'on', label: en ? 'On' : 'Ligada' },
                ],
              },
            ],
          },
          {
            id: 'actions',
            label: { 'pt-BR': 'Experimente', en: 'Try this' },
            controls: [
              {
                kind: 'actions',
                id: 'action',
                label: { 'pt-BR': 'Experimente', en: 'Try this' },
                options: [
                  { value: 'beautiful', label: en ? 'Show me something beautiful' : 'Mostre-me algo bonito', accent: true },
                  { value: 'previous', label: en ? '◀ Mode' : '◀ Modo' },
                  { value: 'next', label: en ? 'Mode ▶' : 'Modo ▶' },
                  { value: 'scatter', label: en ? 'Scatter sand · B' : 'Espalhar areia · B' },
                ],
              },
            ],
          },
        ],
      };
    },

    copy(): ExperimentCopy {
      return buildChladniCopy(facts());
    },

    cameras(): CinematicShot[] {
      const center = new THREE.Vector3();
      rig?.center.getWorldPosition(center);
      const { x, y, z } = center;
      const half = (SQUARE_PLATE.size * DRAW_SCALE) / 2;
      return [
        {
          id: 'overview',
          label: { 'pt-BR': 'Bancada inteira', en: 'Whole bench' },
          // De cima e de frente: a figura na placa precisa ser vista do alto.
          position: { x: x + 0.32, y: y + 1.55, z: z + 1.85 },
          target: { x: x + 0.32, y: y - 0.12, z: z + 0.08 },
          fov: 40,
          portrait: {
            position: { x: x + 0.15, y: y + 1.7, z: z + 1.7 },
            target: { x: x + 0.05, y: y - 0.1, z: z + 0.1 },
            fov: 62,
          },
        },
        {
          id: 'top',
          label: { 'pt-BR': 'De cima', en: 'From above' },
          position: { x, y: y + 1.55, z: z + 0.32 },
          target: { x, y, z },
          fov: 40,
        },
        {
          id: 'sand',
          label: { 'pt-BR': 'A areia de perto', en: 'The sand up close' },
          position: { x: x + half * 0.2, y: y + 0.4, z: z + half + 0.35 },
          target: { x, y, z: z + half * 0.2 },
          fov: 40,
        },
        {
          id: 'generator',
          label: { 'pt-BR': 'O gerador', en: 'The generator' },
          position: { x: x + 1.15, y: y + 0.2, z: z + 0.95 },
          target: { x: x + 1.25, y: y - 0.15, z: z + 0.15 },
          fov: 40,
        },
      ];
    },

    dispose(): void {
      tone?.dispose();
      rig?.dispose();
      generator?.dispose();
      for (const dispose of disposers) dispose();
      disposers.length = 0;
      root.clear();
      rig = null;
      generator = null;
      tone = null;
      field = null;
      context = null;
    },
  };
}
