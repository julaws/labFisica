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
  DEFAULT_MAGNETIC,
  cyclotronPeriod,
  electronMomentum,
  electronSpeed,
  gyroRadius,
  helixPitch,
  helmholtzCurrent,
} from '../../optics/fields/lorentz';
import { SPEED_OF_LIGHT } from '../../optics/waves/double-slit';
import { RAIL_SCENE_PER_MILLIMETER } from '../../scene/bench';
import { createElectronGun, type ElectronGun } from '../../scene/electron-gun';
import { createEquationPlate } from '../../scene/equation-plate';
import { formatNumber } from '../../ui/i18n';
import {
  BEAM_Y,
  CHAMBER_RADIUS,
  NOZZLE_X,
  electronPath,
  energySamples,
  pitchAngle,
} from './apparatus';
import { type Chamber, createChamber } from './chamber';
import { type HelmholtzCoils, createHelmholtzCoils } from './coils';
import {
  type MagneticFacts,
  type TrajectoryMode,
  buildMagneticCopy,
  describeMagnetic,
  formatCm,
  formatField,
  formatSpeed,
  modeLabel,
} from './copy';
import { MAGNETIC_EQUATION_PLATE } from './equation';
import { type EnergySpread, type MagneticState, createMagneticStore } from './state';
import { type ElectronTracks, type TrackSpec, createElectronTracks } from './tracks';

/**
 * Experimento "A força magnética" (ADR 0010), na terceira bancada.
 *
 * Canhão → câmara de vidro entre bobinas de Helmholtz. Cada elétron desenhado
 * segue a trajetória exata do motor (`traceHelix`): reta no gargalo, hélice no
 * campo uniforme da câmara. Mexer num controle recalcula tudo, e os rastros
 * antigos esmaecem.
 *
 * Escala 1:1: metros de cena são metros. O feixe corre ao longo de x.
 */

/** Centro da câmara: x na bancada e altura acima do tampo, m. */
const CHAMBER_X = 0.32;
const CENTER_ABOVE_TOP = 0.45;
/**
 * Tempo mínimo entre dois recálculos durante um arraste, s. Cada recálculo
 * vira um rastro novo no buffer; mais que ~8 por segundo só empilha linhas
 * sobrepostas, sem mudar o que se vê.
 */
const RECOMPUTE_INTERVAL = 0.12;
/** Velocidade desenhada do elétron mais rápido, m/s de cena. */
const VISUAL_SPEED = 0.45;

const railMm = (x: number): number => x / RAIL_SCENE_PER_MILLIMETER + 600;

/** Cor pela velocidade: vermelho para os lentos, azul para os rápidos. */
function colorForFraction(fraction: number, spread: EnergySpread): THREE.Color {
  const { min, max } = DEFAULT_MAGNETIC.spread;
  const t = spread === 'none' ? 1 : (fraction - min) / (max - min);
  return new THREE.Color().setHSL(0.6 * Math.min(1, Math.max(0, t)), 1, 0.55);
}

export function createMagneticForceExperiment(): Experiment {
  const store = createMagneticStore();
  let locale: Locale = 'pt-BR';
  let context: LabContext | null = null;
  const disposers: (() => void)[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  let gun: ElectronGun | null = null;
  let chamber: Chamber | null = null;
  let coils: HelmholtzCoils | null = null;
  let tracks: ElectronTracks | null = null;
  /** Origem no centro da câmara: o referencial de `apparatus.ts`. */
  const root = new THREE.Group();
  root.name = 'magnetic-force';

  const drawingBuffer = new THREE.Vector2();
  let dirty = true;
  let lastPush = -Infinity;
  let now = 0;

  // --- Física ------------------------------------------------------------------
  function recompute(): void {
    const state = store.get();
    const maxSpeed = electronSpeed(state.voltage);
    // Só os parâmetros das hélices vão para a placa de vídeo: nenhum vértice
    // é reescrito (ver tracks.ts).
    const drawn: TrackSpec[] = energySamples(state).map((fraction) => ({
      path: electronPath(state, fraction).helix,
      nozzle: [NOZZLE_X, BEAM_Y, 0],
      color: colorForFraction(fraction, state.spread),
      speed: (VISUAL_SPEED * electronSpeed(state.voltage * fraction)) / maxSpeed,
    }));
    tracks?.push(drawn, now);
    lastPush = now;
    dirty = false;
  }

  function mode(state: Readonly<MagneticState>): TrajectoryMode {
    if (state.field < 1e-7) return 'straight-no-field';
    const theta = pitchAngle(state.angle);
    if (Math.abs(Math.sin(theta)) < 0.02) return 'straight-parallel';
    if (Math.abs(Math.cos(theta)) < 0.02) return 'circle';
    return 'helix';
  }

  function facts(): MagneticFacts {
    const state = store.get();
    const theta = pitchAngle(state.angle);
    const p = electronMomentum(state.voltage);
    const minFraction = state.spread === 'wide' ? DEFAULT_MAGNETIC.spread.min : 1;
    return {
      mode: mode(state),
      field: state.field,
      current: helmholtzCurrent(state.field, DEFAULT_MAGNETIC.coilTurns, DEFAULT_MAGNETIC.coilRadius),
      coilAngle: state.angle,
      pitchAngle: (theta * 180) / Math.PI,
      voltage: state.voltage,
      spread: state.spread === 'wide',
      speed: electronSpeed(state.voltage),
      beta: electronSpeed(state.voltage) / SPEED_OF_LIGHT,
      radiusMax: gyroRadius(p, state.field, theta),
      radiusMin: gyroRadius(electronMomentum(state.voltage * minFraction), state.field, theta),
      pitch: helixPitch(p, state.field, theta),
      period: cyclotronPeriod(state.voltage, state.field),
      chamberRadius: CHAMBER_RADIUS,
    };
  }

  // --- Cena ----------------------------------------------------------------------
  function applyState(): void {
    const state = store.get();
    coils?.setAngle(state.angle);
    coils?.setStrength(state.field / DEFAULT_MAGNETIC.fieldRange.max);
    dirty = true;
    updateLabels();
    context?.invalidate();
  }

  function updateLabels(): void {
    if (!context) return;
    const en = locale === 'en';
    const state = store.get();
    context.labels.setText('mf-gun', `${en ? 'Electron gun' : 'Canhão de elétrons'} · ${formatNumber(state.voltage, 0, locale)} V`);
    context.labels.setText('mf-coils', `${en ? 'Helmholtz coils' : 'Bobinas de Helmholtz'} · ${formatField(state.field, locale)}`);
  }

  const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);
  const wrapAngle = (degrees: number): number => ((((degrees + 180) % 360) + 360) % 360) - 180;

  return {
    id: 'magnetic-force',
    title: { 'pt-BR': 'A força magnética', en: 'The magnetic force' },

    setup(ctx: LabContext): Promise<void> {
      context = ctx;
      const { materials } = ctx;
      const railTop = ctx.bench.railTopY;
      const centerY = ctx.bench.topY + CENTER_ABOVE_TOP;
      // As peças apoiam no topo do trilho, que corre por baixo do feixe.
      const centerAboveRail = centerY - railTop;

      root.position.set(CHAMBER_X, centerY, 0);
      ctx.bench.group.add(root);
      disposers.push(() => root.removeFromParent());

      // --- Canhão ---------------------------------------------------------------
      const standBack = 0.25;
      const gunCarriage = ctx.bench.mountAt(railMm(CHAMBER_X + NOZZLE_X - standBack));
      disposers.push(() => gunCarriage.group.removeFromParent());
      const axisHeight = centerAboveRail + BEAM_Y;
      gun = createElectronGun({ materials, axisHeight, nameplate: 'CANHÃO DE ELÉTRONS · 100–500 V' });
      gun.group.position.set(standBack, axisHeight, 0);
      gunCarriage.group.add(gun.group);
      for (const object of gun.glowing) ctx.addGlow(object);

      // --- Câmara e bobinas --------------------------------------------------------
      chamber = createChamber({ materials, centerHeight: centerAboveRail });
      root.add(chamber.group);
      coils = createHelmholtzCoils({ materials, centerHeight: centerAboveRail });
      root.add(coils.group);
      for (const object of coils.glowing) ctx.addGlow(object);

      tracks = createElectronTracks();
      root.add(tracks.group);
      for (const object of tracks.glowing) ctx.addGlow(object);

      // --- Placa das equações na frente da bancada ------------------------------
      // Como nas bancadas do feixe de elétrons e do tunelamento: logo abaixo da
      // faixa de LED, a parte da lateral que a vista padrão enquadra.
      const equation = createEquationPlate({
        spec: MAGNETIC_EQUATION_PLATE,
        width: ctx.bench.width - 0.3,
        height: 0.46,
      });
      equation.mesh.position.set(0, ctx.bench.topY - 0.36, ctx.bench.frontZ + 0.006);
      ctx.bench.group.add(equation.mesh);
      disposers.push(() => {
        equation.mesh.removeFromParent();
        equation.dispose();
      });

      // --- Etiquetas -------------------------------------------------------------
      ctx.labels.add({ id: 'mf-gun', anchor: gun.group, offset: { x: -0.2, y: 0.13, z: 0 }, text: '' });
      ctx.labels.add({ id: 'mf-coils', anchor: coils.labelAnchor, text: '', accent: '#C8923A' });
      disposers.push(() => {
        for (const id of ['mf-gun', 'mf-coils']) ctx.labels.remove(id);
      });

      // --- Atalhos ---------------------------------------------------------------
      const nudgeField = (direction: number): void =>
        store.set({
          field: clamp(
            Math.round((store.get().field + direction * 0.05e-3) * 1e5) / 1e5,
            DEFAULT_MAGNETIC.fieldRange.min,
            DEFAULT_MAGNETIC.fieldRange.max,
          ),
        });
      const nudgeAngle = (direction: number): void => store.set({ angle: wrapAngle(store.get().angle + direction * 5) });
      disposers.push(
        ctx.onKey('[', () => nudgeField(-1)),
        ctx.onKey(']', () => nudgeField(1)),
        ctx.onKey(',', () => nudgeAngle(-1)),
        ctx.onKey('.', () => nudgeAngle(1)),
        ctx.onKey('1', () => store.set({ angle: 0 })),
        ctx.onKey('2', () => store.set({ angle: 20 })),
        ctx.onKey('3', () => store.set({ angle: 90 })),
        ctx.onKey('4', () => store.set({ angle: 180 })),
        ctx.onKey('m', () => store.set({ spread: store.get().spread === 'wide' ? 'none' : 'wide' })),
      );

      disposers.push(store.subscribe(() => applyState()));
      applyState();
      recompute();
      return Promise.resolve();
    },

    update(dt: number, elapsed: number): void {
      now = elapsed;
      // A largura das linhas é em pixels: acompanha o buffer de desenho, que
      // muda com a janela e com a qualidade adaptativa.
      if (context) {
        context.renderer.getDrawingBufferSize(drawingBuffer);
        tracks?.setResolution(drawingBuffer.x, drawingBuffer.y, context.renderer.getPixelRatio());
      }
      if (dirty && now - lastPush >= RECOMPUTE_INTERVAL) recompute();
      tracks?.update(dt, now);
      // Os elétrons andam sempre: o loop não dorme.
      context?.invalidate();
    },

    set(id: string, value: string | number | boolean): void {
      const { fieldRange, voltageRange } = DEFAULT_MAGNETIC;
      switch (id) {
        case 'field':
          // O slider fala em mT.
          store.set({ field: clamp(Number(value) * 1e-3, fieldRange.min, fieldRange.max) });
          break;
        case 'angle':
          store.set({ angle: wrapAngle(Number(value)) });
          break;
        case 'voltage':
          store.set({ voltage: clamp(Number(value), voltageRange.min, voltageRange.max) });
          break;
        case 'spread':
          if (value === 'wide' || value === 'none') store.set({ spread: value });
          break;
        default:
          break;
      }
    },

    get(id: string): string | number | boolean {
      const state = store.get();
      switch (id) {
        case 'field':
          return state.field * 1e3;
        case 'angle':
          return state.angle;
        case 'voltage':
          return state.voltage;
        case 'spread':
          return state.spread;
        default:
          return 0;
      }
    },

    subscribe(listener: () => void): () => void {
      return store.subscribe(() => listener());
    },

    hud(hudLocale: Locale): HudModel {
      const f = facts();
      const copy = buildMagneticCopy(f);
      const en = hudLocale === 'en';
      const described = describeMagnetic(f, hudLocale);
      const straight = f.mode === 'straight-no-field' || f.mode === 'straight-parallel';
      return {
        title: copy.title[hudLocale],
        subtitle: copy.subtitle[hudLocale],
        chips: [
          { id: 'field', label: 'B', value: formatField(f.field, hudLocale) },
          { id: 'voltage', label: en ? 'Gun' : 'Canhão', value: `${formatNumber(f.voltage, 0, hudLocale)} V` },
          { id: 'radius', label: en ? 'Radius' : 'Raio', value: straight ? '∞' : formatCm(f.radiusMax, hudLocale) },
          { id: 'path', label: en ? 'Path' : 'Trajetória', value: modeLabel(f.mode, hudLocale) },
        ],
        sentence: described.sentence,
        highlights: described.highlights,
      };
    },

    numbers(numbersLocale: Locale): NumberRow[] {
      const f = facts();
      const en = numbersLocale === 'en';
      const n = (value: number, decimals: number): string => formatNumber(value, decimals, numbersLocale);
      const dash = '—';
      return [
        { id: 'field', label: en ? 'Field at the centre B' : 'Campo no centro B', value: formatField(f.field, numbersLocale) },
        {
          id: 'current',
          label: en ? 'Coil current I' : 'Corrente nas bobinas I',
          value: `${n(f.current, 2)} A`,
          hint: 'B = (4/5)^{3/2} μ₀NI/R · N = 200, R = 30 cm',
        },
        {
          id: 'angle',
          label: en ? 'Angle between beam and B' : 'Ângulo entre feixe e B',
          value: `${n(f.pitchAngle, 0)}°`,
        },
        { id: 'voltage', label: en ? 'Gun voltage U' : 'Tensão do canhão U', value: `${n(f.voltage, 0)} V` },
        {
          id: 'speed',
          label: en ? 'Fastest electron v' : 'Elétron mais rápido v',
          value: formatSpeed(f.speed, numbersLocale),
          hint: `${n(f.beta * 100, 2)}% c · eU = ½mv²`,
        },
        {
          id: 'radius',
          label: en ? 'Radius (fastest)' : 'Raio (mais rápido)',
          value: formatCm(f.radiusMax, numbersLocale),
          hint: 'r = mv·sen θ / (|q|B)',
        },
        {
          id: 'radius-min',
          label: en ? 'Radius (slowest)' : 'Raio (mais lento)',
          value: f.spread ? formatCm(f.radiusMin, numbersLocale) : dash,
        },
        {
          id: 'pitch',
          label: en ? 'Helix pitch' : 'Passo da hélice',
          value: f.mode === 'helix' ? formatCm(f.pitch, numbersLocale) : dash,
          hint: 'p = 2πmv·cos θ / (|q|B)',
        },
        {
          id: 'period',
          label: en ? 'Time for one turn' : 'Tempo de uma volta',
          value: Number.isFinite(f.period) ? `${n(f.period * 1e9, 1)} ns` : dash,
          hint: 'T = 2πm / (|q|B)',
        },
      ];
    },

    setLocale(next: Locale): void {
      locale = next;
      updateLabels();
    },

    ui(): PanelSchema {
      const en = locale === 'en';
      const { fieldRange, voltageRange } = DEFAULT_MAGNETIC;
      return {
        groups: [
          {
            id: 'field',
            label: { 'pt-BR': 'Campo B', en: 'Field B' },
            hint: { 'pt-BR': '[ ]', en: '[ ]' },
            controls: [
              {
                kind: 'slider',
                id: 'field',
                label: { 'pt-BR': 'Campo B', en: 'Field B' },
                min: fieldRange.min * 1e3,
                max: fieldRange.max * 1e3,
                step: 0.01,
                unit: 'mT',
                decimals: 2,
              },
              {
                kind: 'slider',
                id: 'angle',
                label: { 'pt-BR': 'Giro das bobinas · , .', en: 'Coil rotation · , .' },
                min: -180,
                max: 180,
                step: 1,
                unit: '°',
              },
            ],
          },
          {
            id: 'gun',
            label: { 'pt-BR': 'Canhão', en: 'Gun' },
            controls: [
              {
                kind: 'slider',
                id: 'voltage',
                label: { 'pt-BR': 'Canhão', en: 'Gun' },
                min: voltageRange.min,
                max: voltageRange.max,
                step: 1,
                unit: 'V',
              },
              {
                kind: 'segmented',
                id: 'spread',
                label: { 'pt-BR': 'Energia · M', en: 'Energy · M' },
                options: [
                  { value: 'wide', label: en ? 'Spread' : 'Espalhada' },
                  { value: 'none', label: en ? 'Single' : 'Única' },
                ],
              },
            ],
          },
        ],
      };
    },

    copy(): ExperimentCopy {
      return buildMagneticCopy(facts());
    },

    cameras(): CinematicShot[] {
      const center = new THREE.Vector3();
      root.updateWorldMatrix(true, false);
      root.getWorldPosition(center);
      // Meio da bancada: o canhão fica à esquerda, a placa à direita.
      const bx = center.x - CHAMBER_X;
      const y = center.y;
      const z = center.z;
      const gunX = center.x + NOZZLE_X;
      return [
        {
          id: 'overview',
          label: { 'pt-BR': 'Bancada inteira', en: 'Whole bench' },
          position: { x: bx + 0.1, y: y + 0.75, z: z + 3.6 },
          target: { x: bx + 0.1, y: y - 0.22, z },
          fov: 40,
          portrait: {
            position: { x: bx + 1.3, y: y + 0.85, z: z + 3.1 },
            target: { x: bx + 0.25, y: y - 0.2, z },
            fov: 60,
          },
        },
        {
          id: 'chamber',
          label: { 'pt-BR': 'A câmara', en: 'The chamber' },
          position: { x: center.x, y: y + 0.05, z: z + 1.25 },
          target: { x: center.x, y: y - 0.05, z },
          fov: 40,
        },
        {
          id: 'top',
          label: { 'pt-BR': 'De cima', en: 'From above' },
          position: { x: center.x - 0.2, y: y + 1.7, z: z + 0.45 },
          target: { x: center.x - 0.2, y, z },
          fov: 45,
        },
        {
          id: 'gun',
          label: { 'pt-BR': 'O canhão', en: 'The gun' },
          position: { x: gunX - 0.1, y: y - 0.1, z: z + 0.95 },
          target: { x: gunX - 0.25, y: y - 0.3, z },
          fov: 40,
        },
      ];
    },

    dispose(): void {
      tracks?.dispose();
      coils?.dispose();
      chamber?.dispose();
      gun?.dispose();
      for (const dispose of disposers) dispose();
      disposers.length = 0;
      for (const geometry of geometries) geometry.dispose();
      geometries.length = 0;
      root.clear();
      tracks = null;
      coils = null;
      chamber = null;
      gun = null;
      context = null;
    },
  };
}
