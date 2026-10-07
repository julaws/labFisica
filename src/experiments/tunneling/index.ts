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
  DEFAULT_TUNNELING,
  approximateTransmission,
  barrierWave,
  deBroglie,
  decayConstant,
  transmission,
  tunnelingCurrent,
} from '../../optics/quantum/tunneling';
import { RAIL_SCENE_PER_MILLIMETER } from '../../scene/bench';
import { createElectronGun, type ElectronGun } from '../../scene/electron-gun';
import { createEquationPlate } from '../../scene/equation-plate';
import { type ExplainerVideo, mountExplainerVideo } from '../../scene/explainer-video';
import videoPosterUrl from '../../assets/videos/planka-tunelamento.jpg?url';
import { formatNumber } from '../../ui/i18n';
import { type Barrier, createBarrier } from './barrier';
import { type Collector, createCollector } from './collector';
import {
  type TunnelingFacts,
  buildTunnelingCopy,
  describeTunneling,
  formatCurrent,
  formatEv,
  formatNm,
  formatPercent,
} from './copy';
import { type ElectronStream, createElectronStream } from './electrons';
import { TUNNELING_PLATE } from './equation';
import { BARRIER_X, BASE_ABOVE_TOP, COLLECTOR_X, NOZZLE_X, SCENE_PER_EV, SCENE_PER_NM } from './layout';
import { createTunnelingStore } from './state';
import { type ElectronWave, createElectronWave } from './wave';

/**
 * Experimento "O tunelamento" (ADR 0011), na quarta bancada.
 *
 * Canhão → muro de energia → coletor, num diagrama de energia em 3D: altura é
 * energia. A onda do elétron (solução exata de Schrödinger, avaliada na placa
 * de vídeo) corre sobre o feixe; os elétrons, um a um, refletem ou tunelam com
 * a probabilidade exata do motor, e o coletor conta.
 */

const ENERGY = DEFAULT_TUNNELING.energy;
/** Tempo mínimo entre duas atualizações do painel de contagem, s. */
const COUNTER_INTERVAL = 0.2;

const railMm = (x: number): number => x / RAIL_SCENE_PER_MILLIMETER + 600;

/** Elétrons desenhados por segundo: cresce com o logaritmo da corrente. */
const drawnRate = (incident: number): number => 2 + 18 * Math.log10(Math.max(incident / 1e-9, 1));

export function createTunnelingExperiment(): Experiment {
  const store = createTunnelingStore();
  let locale: Locale = 'pt-BR';
  let context: LabContext | null = null;
  let explainer: ExplainerVideo | null = null;
  const disposers: (() => void)[] = [];

  let gun: ElectronGun | null = null;
  let barrier: Barrier | null = null;
  let wave: ElectronWave | null = null;
  let electrons: ElectronStream | null = null;
  let collector: Collector | null = null;
  /** Origem na face esquerda do muro, no nível de 0 eV. */
  const root = new THREE.Group();
  root.name = 'tunneling';

  let tunneled = 0;
  let reflected = 0;
  let counterDirty = true;
  let counterClock = 0;

  // --- Física ------------------------------------------------------------------
  function facts(): TunnelingFacts {
    const { height, width, incident } = store.get();
    const kappa = decayConstant(ENERGY, height);
    return {
      energy: ENERGY,
      height,
      width,
      incident,
      current: tunnelingCurrent(incident, ENERGY, height, width),
      transmission: transmission(ENERGY, height, width),
      approximate: approximateTransmission(ENERGY, height, width),
      kappa,
      decayLength: kappa > 0 ? 1 / kappa : Number.POSITIVE_INFINITY,
      wavelength: deBroglie(ENERGY),
      transmissionWider: transmission(ENERGY, height, width + 0.1e-9),
    };
  }

  function counterReading(): Parameters<Collector['showReading']>[0] {
    const en = locale === 'en';
    const f = facts();
    const total = tunneled + reflected;
    const measured = total > 0 ? formatPercent(tunneled / total, locale) : '—';
    return {
      title: en ? 'COLLECTOR · COUNT' : 'COLETOR · CONTAGEM',
      rows: [
        [en ? 'Tunnelled' : 'Tunelaram', formatNumber(tunneled, 0, locale)],
        [en ? 'Reflected' : 'Refletiram', formatNumber(reflected, 0, locale)],
        [en ? 'T measured' : 'T medido', measured],
        [en ? 'T computed' : 'T calculado', formatPercent(f.transmission, locale)],
      ],
      footer: `I = ${formatCurrent(f.current, locale)}`,
    };
  }

  // --- Cena ----------------------------------------------------------------------
  function applyState(previous?: { height: number; width: number }): void {
    const state = store.get();
    const f = facts();
    barrier?.setSize(state.height, state.width);
    wave?.setWave(barrierWave(ENERGY, state.height, state.width));
    wave?.setVisible(state.wave === 'on');
    electrons?.setTransmission(f.transmission);
    electrons?.setBarrierWidth((state.width / 1e-9) * SCENE_PER_NM);
    electrons?.setRate(drawnRate(state.incident));
    // A contagem recomeça quando o muro muda: a fração medida é deste muro.
    if (!previous || previous.height !== state.height || previous.width !== state.width) {
      tunneled = 0;
      reflected = 0;
    }
    counterDirty = true;
    updateLabels();
    context?.invalidate();
  }

  function updateLabels(): void {
    if (!context) return;
    const en = locale === 'en';
    const state = store.get();
    const f = facts();
    context.labels.setText(
      'tn-gun',
      `${en ? 'Electron gun' : 'Canhão de elétrons'} · ${formatCurrent(state.incident, locale)}`,
    );
    context.labels.setText(
      'tn-barrier',
      `${en ? 'Wall' : 'Muro'} · ${formatEv(state.height, locale)} × ${formatNm(state.width, locale)}`,
    );
    context.labels.setText('tn-collector', `${en ? 'Collector' : 'Coletor'} · ${formatPercent(f.transmission, locale)}`);
    context.labels.setText('tn-energy', `E = ${formatEv(ENERGY, locale)}`);
  }

  const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);
  const round = (value: number, step: number): number => Math.round(value / step) * step;
  const { heightRange, widthRange, incidentRange } = DEFAULT_TUNNELING;

  return {
    id: 'tunneling',
    title: { 'pt-BR': 'O tunelamento', en: 'Quantum tunnelling' },

    setup(ctx: LabContext): Promise<void> {
      context = ctx;
      const { materials } = ctx;
      const baseY = ctx.bench.topY + BASE_ABOVE_TOP;
      const beamY = ENERGY * SCENE_PER_EV;

      root.position.set(BARRIER_X, baseY, 0);
      ctx.bench.group.add(root);
      disposers.push(() => root.removeFromParent());

      // --- Canhão, com a placa dourada -----------------------------------------
      const standBack = 0.25;
      const gunCarriage = ctx.bench.mountAt(railMm(BARRIER_X + NOZZLE_X - standBack));
      disposers.push(() => gunCarriage.group.removeFromParent());
      const axisHeight = baseY + beamY - ctx.bench.railTopY;
      gun = createElectronGun({ materials, axisHeight, nameplate: 'CANHÃO DE ELÉTRONS · 1 eV' });
      gun.group.position.set(standBack, axisHeight, 0);
      gunCarriage.group.add(gun.group);
      for (const object of gun.glowing) ctx.addGlow(object);

      // --- Muro, onda, elétrons e coletor ----------------------------------------
      barrier = createBarrier({ materials, baseAboveTop: BASE_ABOVE_TOP });
      barrier.setEnergy(ENERGY);
      root.add(barrier.group);
      for (const object of barrier.glowing) ctx.addGlow(object);

      wave = createElectronWave();
      wave.setBaseline(beamY);
      root.add(wave.group);
      for (const object of wave.glowing) ctx.addGlow(object);

      const collectorRef = createCollector({ materials });
      collector = collectorRef;
      collectorRef.setBaseline(beamY);
      root.add(collectorRef.group);
      for (const object of collectorRef.glowing) ctx.addGlow(object);

      electrons = createElectronStream({
        onArrive: (fate) => {
          if (fate === 'tunneled') {
            tunneled += 1;
            collectorRef.flash();
          } else reflected += 1;
          counterDirty = true;
        },
      });
      electrons.setBaseline(beamY);
      root.add(electrons.points);
      ctx.addGlow(electrons.points);

      // --- Placa da equação na frente da bancada -------------------------------
      const equation = createEquationPlate({ spec: TUNNELING_PLATE, width: ctx.bench.width - 0.3, height: 0.46 });
      equation.mesh.position.set(0, ctx.bench.topY - 0.36, ctx.bench.frontZ + 0.006);
      ctx.bench.group.add(equation.mesh);
      disposers.push(() => {
        equation.mesh.removeFromParent();
        equation.dispose();
      });

      // --- TV do vídeo explicativo ------------------------------------------
      // Na frente do tampo, à direita, diante do coletor: a ponta da bancada
      // fica fora da vista padrão. Clicar nela (ou a tecla V) abre o vídeo.
      explainer = mountExplainerVideo(
        ctx,
        {
          file: 'planka-tunelamento.mp4',
          poster: videoPosterUrl,
          title: { 'pt-BR': 'Planka e o Tunelamento', en: 'Planka and Quantum Tunnelling' },
          description: {
            'pt-BR': 'A bolinha que não passa, a onda que atravessa e onde o tunelamento aparece no dia a dia, com a Planka.',
            en: 'The ball that bounces back, the wave that gets through and where tunnelling shows up in everyday life, with Planka (in Portuguese).',
          },
          position: { x: ctx.bench.width / 2 - 0.62, y: ctx.bench.topY, z: ctx.bench.frontZ - 0.12 },
          rotationY: -0.35,
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

      // --- Etiquetas ---------------------------------------------------------------
      ctx.labels.add({ id: 'tn-gun', anchor: gun.group, offset: { x: -0.2, y: 0.13, z: 0 }, text: '' });
      ctx.labels.add({ id: 'tn-barrier', anchor: barrier.top, text: '', accent: '#b48cff' });
      ctx.labels.add({ id: 'tn-collector', anchor: collectorRef.labelAnchor, text: '', accent: '#ffd36b' });
      ctx.labels.add({ id: 'tn-energy', anchor: barrier.energyAnchor, text: '', accent: '#ffd36b' });
      disposers.push(() => {
        for (const id of ['tn-gun', 'tn-barrier', 'tn-collector', 'tn-energy']) ctx.labels.remove(id);
      });

      // --- Atalhos -------------------------------------------------------------------
      const nudgeWidth = (direction: number): void =>
        store.set({ width: clamp(round(store.get().width + direction * 0.05e-9, 0.01e-9), widthRange.min, widthRange.max) });
      const nudgeHeight = (direction: number): void =>
        store.set({ height: clamp(round(store.get().height + direction * 0.1, 0.05), heightRange.min, heightRange.max) });
      const scaleIncident = (factor: number): void =>
        store.set({ incident: clamp(store.get().incident * factor, incidentRange.min, incidentRange.max) });
      disposers.push(
        ctx.onKey('[', () => nudgeWidth(-1)),
        ctx.onKey(']', () => nudgeWidth(1)),
        ctx.onKey(',', () => nudgeHeight(-1)),
        ctx.onKey('.', () => nudgeHeight(1)),
        ctx.onKey('-', () => scaleIncident(1 / 1.5)),
        ctx.onKey('=', () => scaleIncident(1.5)),
        ctx.onKey('o', () => store.set({ wave: store.get().wave === 'on' ? 'off' : 'on' })),
      );

      let previous = { height: store.get().height, width: store.get().width };
      disposers.push(
        store.subscribe((state) => {
          applyState(previous);
          previous = { height: state.height, width: state.width };
        }),
      );
      applyState();
      return Promise.resolve();
    },

    update(dt: number, elapsed: number): void {
      barrier?.update(elapsed);
      wave?.update(elapsed);
      electrons?.update(dt);
      collector?.update(dt);
      counterClock += dt;
      if (counterDirty && counterClock >= COUNTER_INTERVAL) {
        collector?.showReading(counterReading());
        counterDirty = false;
        counterClock = 0;
      }
      // Os elétrons andam sempre: o loop não dorme.
      context?.invalidate();
    },

    set(id: string, value: string | number | boolean): void {
      switch (id) {
        case 'incident':
          // O slider fala em nA.
          store.set({ incident: clamp(Number(value) * 1e-9, incidentRange.min, incidentRange.max) });
          break;
        case 'height':
          store.set({ height: clamp(Number(value), heightRange.min, heightRange.max) });
          break;
        case 'width':
          // O slider fala em nm.
          store.set({ width: clamp(Number(value) * 1e-9, widthRange.min, widthRange.max) });
          break;
        case 'wave':
          if (value === 'on' || value === 'off') store.set({ wave: value });
          break;
        default:
          break;
      }
    },

    get(id: string): string | number | boolean {
      const state = store.get();
      switch (id) {
        case 'incident':
          return state.incident * 1e9;
        case 'height':
          return state.height;
        case 'width':
          return state.width * 1e9;
        case 'wave':
          return state.wave;
        default:
          return 0;
      }
    },

    subscribe(listener: () => void): () => void {
      return store.subscribe(() => listener());
    },

    hud(hudLocale: Locale): HudModel {
      const f = facts();
      const copy = buildTunnelingCopy(f);
      const en = hudLocale === 'en';
      const described = describeTunneling(f, hudLocale);
      return {
        title: copy.title[hudLocale],
        subtitle: copy.subtitle[hudLocale],
        chips: [
          { id: 'transmission', label: en ? 'Tunnel' : 'Tunela', value: formatPercent(f.transmission, hudLocale) },
          { id: 'current', label: 'I', value: formatCurrent(f.current, hudLocale) },
          { id: 'height', label: en ? 'Height' : 'Altura', value: formatEv(f.height, hudLocale) },
          { id: 'width', label: en ? 'Width' : 'Largura', value: formatNm(f.width, hudLocale) },
        ],
        sentence: described.sentence,
        highlights: described.highlights,
      };
    },

    numbers(numbersLocale: Locale): NumberRow[] {
      const f = facts();
      const en = numbersLocale === 'en';
      const n = (value: number, decimals: number): string => formatNumber(value, decimals, numbersLocale);
      const below = f.energy < f.height;
      return [
        { id: 'energy', label: en ? 'Electron energy E' : 'Energia do elétron E', value: formatEv(f.energy, numbersLocale) },
        { id: 'height', label: en ? 'Wall height V₀' : 'Altura do muro V₀', value: formatEv(f.height, numbersLocale) },
        { id: 'width', label: en ? 'Wall width a' : 'Largura do muro a', value: formatNm(f.width, numbersLocale) },
        {
          id: 'wavelength',
          label: en ? 'de Broglie wavelength λ' : 'Comprimento de onda λ',
          value: `${n(f.wavelength * 1e9, 3)} nm`,
          hint: 'λ = h / √(2mE)',
        },
        {
          id: 'kappa',
          label: en ? 'Decay constant κ' : 'Constante de decaimento κ',
          value: below ? `${n(f.kappa * 1e-9, 3)} nm⁻¹` : '—',
          hint: 'κ = √(2m(V₀ − E)) / ħ',
        },
        {
          id: 'decay',
          label: en ? 'Decay length 1/κ' : 'Comprimento de decaimento 1/κ',
          value: below ? `${n(f.decayLength * 1e9, 3)} nm` : '—',
        },
        {
          id: 'transmission',
          label: en ? 'Transmission T (exact)' : 'Transmissão T (exata)',
          value: formatPercent(f.transmission, numbersLocale),
          hint: 'T = [1 + V₀² senh²(κa) / (4E(V₀ − E))]⁻¹',
        },
        {
          id: 'approximate',
          label: en ? 'T, wide-wall formula' : 'T, fórmula de muro largo',
          value: below ? formatPercent(f.approximate, numbersLocale) : '—',
          hint: '16E(V₀ − E)/V₀² · e^(−2κa)',
        },
        { id: 'incident', label: en ? 'Beam current I₀' : 'Corrente do feixe I₀', value: formatCurrent(f.incident, numbersLocale) },
        {
          id: 'current',
          label: en ? 'Tunnelling current I' : 'Corrente de tunelamento I',
          value: formatCurrent(f.current, numbersLocale),
          hint: 'I = I₀ · T',
        },
      ];
    },

    setLocale(next: Locale): void {
      locale = next;
      updateLabels();
      explainer?.setLocale(next);
      counterDirty = true;
    },

    ui(): PanelSchema {
      const en = locale === 'en';
      return {
        groups: [
          {
            id: 'beam',
            label: { 'pt-BR': 'Intensidade do feixe', en: 'Beam intensity' },
            controls: [
              {
                kind: 'slider',
                id: 'incident',
                label: { 'pt-BR': 'Intensidade do feixe', en: 'Beam intensity' },
                min: incidentRange.min * 1e9,
                max: incidentRange.max * 1e9,
                step: 1,
                logarithmic: true,
                unit: 'nA',
                decimals: 1,
              },
            ],
          },
          {
            id: 'barrier',
            label: { 'pt-BR': 'Altura', en: 'Height' },
            hint: { 'pt-BR': ', .', en: ', .' },
            controls: [
              {
                kind: 'slider',
                id: 'height',
                label: { 'pt-BR': 'Altura', en: 'Height' },
                min: heightRange.min,
                max: heightRange.max,
                step: 0.05,
                unit: 'eV',
                decimals: 2,
              },
              {
                kind: 'slider',
                id: 'width',
                label: { 'pt-BR': 'Largura', en: 'Width' },
                min: widthRange.min * 1e9,
                max: widthRange.max * 1e9,
                step: 0.01,
                unit: 'nm',
                decimals: 2,
              },
            ],
          },
          {
            id: 'view',
            label: { 'pt-BR': 'Onda · O', en: 'Wave · O' },
            controls: [
              {
                kind: 'segmented',
                id: 'wave',
                label: { 'pt-BR': 'Onda · O', en: 'Wave · O' },
                options: [
                  { value: 'on', label: en ? 'Wave and electrons' : 'Onda e elétrons' },
                  { value: 'off', label: en ? 'Electrons only' : 'Só elétrons' },
                ],
                secondary: true,
              },
            ],
          },
        ],
      };
    },

    copy(): ExperimentCopy {
      return buildTunnelingCopy(facts());
    },

    cameras(): CinematicShot[] {
      const origin = new THREE.Vector3();
      root.updateWorldMatrix(true, false);
      root.getWorldPosition(origin);
      const bx = origin.x - BARRIER_X;
      const y = origin.y;
      const z = origin.z;
      const beam = y + ENERGY * SCENE_PER_EV;
      return [
        {
          id: 'overview',
          label: { 'pt-BR': 'Bancada inteira', en: 'Whole bench' },
          position: { x: bx + 0.05, y: y + 0.62, z: z + 2.85 },
          target: { x: bx + 0.05, y: y - 0.04, z },
          fov: 40,
          portrait: {
            position: { x: bx + 0.85, y: y + 0.7, z: z + 2.3 },
            target: { x: bx + 0.12, y: y + 0.1, z },
            fov: 60,
          },
        },
        {
          id: 'barrier',
          label: { 'pt-BR': 'O muro', en: 'The wall' },
          position: { x: origin.x + 0.1, y: beam + 0.22, z: z + 1.05 },
          target: { x: origin.x + 0.1, y: beam + 0.02, z },
          fov: 40,
        },
        {
          id: 'collector',
          label: { 'pt-BR': 'O coletor', en: 'The collector' },
          position: { x: origin.x + COLLECTOR_X - 0.2, y: y + 0.45, z: z + 1.1 },
          target: { x: origin.x + COLLECTOR_X - 0.05, y: y + 0.3, z: z - 0.1 },
          fov: 40,
        },
        {
          id: 'top',
          label: { 'pt-BR': 'De cima', en: 'From above' },
          position: { x: bx + 0.05, y: y + 1.9, z: z + 0.5 },
          target: { x: bx + 0.05, y, z },
          fov: 45,
        },
        {
          id: 'gun',
          label: { 'pt-BR': 'O canhão', en: 'The gun' },
          position: { x: origin.x + NOZZLE_X - 0.1, y: beam, z: z + 0.95 },
          target: { x: origin.x + NOZZLE_X - 0.25, y: beam - 0.2, z },
          fov: 40,
        },
      ];
    },

    dispose(): void {
      electrons?.dispose();
      wave?.dispose();
      barrier?.dispose();
      collector?.dispose();
      gun?.dispose();
      for (const dispose of disposers) dispose();
      disposers.length = 0;
      root.clear();
      electrons = null;
      wave = null;
      barrier = null;
      collector = null;
      gun = null;
      context = null;
    },
  };
}
