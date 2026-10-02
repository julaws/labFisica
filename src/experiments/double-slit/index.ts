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
  DEFAULT_DOUBLE_SLIT,
  type DoubleSlitGeometry,
  type SlitState,
  countMaxima,
  electronSpeedFraction,
  electronWavelength,
  fresnelNumber,
  fringeSpacing,
  screenIntensity,
} from '../../optics/waves/double-slit';
import { RAIL_SCENE_PER_MILLIMETER } from '../../scene/bench';
import { formatDistance, formatNumber } from '../../ui/i18n';
import { createElectronBeam, type ElectronBeam } from './beam';
import {
  type DoubleSlitFacts,
  type PatternMode,
  buildDoubleSlitCopy,
  describeDoubleSlit,
  patternLabel,
} from './copy';
import { createElectronGun, type ElectronGun } from './gun';
import { createPhosphorScreen, type PhosphorScreen } from './screen';
import { createSlitPlate, type SlitPlate, type SlitSide } from './slit-plate';
import {
  type DoubleSlitState,
  PHOSPHOR,
  PHOSPHOR_COLORS,
  type PhosphorColor,
  createDoubleSlitStore,
} from './state';
import { createWaveField, type WaveField } from './wave-field';

/**
 * Experimento "A dupla fenda" (ADR 0009), na segunda bancada da sala.
 *
 * Canhão de elétrons → placa com duas fendas (tampas e detectores) → anteparo
 * de fósforo. O padrão no anteparo vem de `src/optics/waves`: integral de
 * Fresnel das duas fendas, coerente sem detectores e incoerente com eles.
 *
 * ## Escalas (declaradas no modal)
 *
 * - Transversal ao feixe, tudo está ampliado `MAGNIFICATION` vezes: 1 µm real
 *   vira 1 cm na cena. As fendas, o padrão e o anteparo.
 * - Ao longo do feixe, as distâncias são reais: o anteparo a 1,40 m está a
 *   1,40 unidade de cena das fendas.
 */

const MAGNIFICATION = 1e4;
/** Altura do eixo do feixe acima do carrinho, em unidades de cena. */
const AXIS_HEIGHT = 0.3;
/** Posições na bancada (x local, com 0 no meio do trilho). */
const LAYOUT = {
  slitX: -0.42,
  /** Distância da ponta do canhão às fendas. */
  gunGap: 0.58,
  /** Do bocal até o suporte do canhão, onde fica o carrinho. */
  gunStandBack: 0.25,
} as const;
const SCREEN_HEIGHT = 0.26;
/** Monitor no fundo da bancada: x a partir das fendas, z da bancada. */
const MONITOR = { width: 0.62, depth: 0.035, x: 0.62, z: -0.38, lift: 0.2 } as const;
const SAMPLES = 512;
/** Contraste da imagem do anteparo (ver `computePattern`). */
export const EXPOSURE_GAMMA = 2;
/** Um quadro de arraste do anteparo: 600 px percorrem a faixa inteira. */
const DRAG_PIXELS = 600;

const WAVELENGTH = electronWavelength(DEFAULT_DOUBLE_SLIT.voltage);
const RANGE = DEFAULT_DOUBLE_SLIT.distanceRange;
const WIDTH_RANGE = DEFAULT_DOUBLE_SLIT.screenWidthRange;

const railMm = (x: number): number => x / RAIL_SCENE_PER_MILLIMETER + 600;

export function createDoubleSlitExperiment(): Experiment {
  const store = createDoubleSlitStore();
  let locale: Locale = 'pt-BR';
  let context: LabContext | null = null;

  const disposers: (() => void)[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  let gun: ElectronGun | null = null;
  let plate: SlitPlate | null = null;
  let screen: PhosphorScreen | null = null;
  let wave: WaveField | null = null;
  let beam: ElectronBeam | null = null;
  /** Grupo das fendas: origem no meio da placa, na altura do eixo. */
  const slitRoot = new THREE.Group();
  slitRoot.name = 'double-slit';
  let screenCarriage: { moveTo(mm: number): void } | null = null;

  // --- Padrão calculado ------------------------------------------------------
  const positions = new Float64Array(SAMPLES);
  /** Intensidade no estado atual, e as de cada fenda sozinha (para o sorteio). */
  let current: Float64Array = new Float64Array(SAMPLES);
  const cdf: Record<SlitSide | 'both', Float64Array> = {
    left: new Float64Array(SAMPLES),
    right: new Float64Array(SAMPLES),
    both: new Float64Array(SAMPLES),
  };
  const display = new Float32Array(SAMPLES);
  let fringes = 0;

  const geometryFor = (state: Readonly<DoubleSlitState>): DoubleSlitGeometry => ({
    wavelength: WAVELENGTH,
    slitWidth: DEFAULT_DOUBLE_SLIT.slitWidth,
    separation: DEFAULT_DOUBLE_SLIT.separation,
    distance: state.distance,
  });

  const fillCdf = (target: Float64Array, intensity: ArrayLike<number>): void => {
    let sum = 0;
    for (let i = 0; i < SAMPLES; i += 1) {
      sum += intensity[i]!;
      target[i] = sum;
    }
  };

  function computePattern(): void {
    const state = store.get();
    const geometry = geometryFor(state);
    for (let i = 0; i < SAMPLES; i += 1) positions[i] = ((i + 0.5) / SAMPLES - 0.5) * state.screenWidth;

    const slits: SlitState = { left: state.left, right: state.right, detectors: state.detectors };
    current = screenIntensity(geometry, slits, positions);
    fillCdf(cdf.both, current);
    fillCdf(cdf.left, screenIntensity(geometry, { left: true, right: false, detectors: true }, positions));
    fillCdf(cdf.right, screenIntensity(geometry, { left: false, right: true, detectors: true }, positions));
    fringes = countMaxima(current);

    // Referência fixa para o brilho: o máximo com as duas fendas abertas e sem
    // detectores, nesta distância. Assim tampar uma fenda escurece o anteparo
    // em vez de ser compensado pela normalização.
    const reference = screenIntensity(geometry, { left: true, right: true, detectors: false }, positions);
    let peak = 0;
    for (let i = 0; i < SAMPLES; i += 1) peak = Math.max(peak, reference[i]!);
    // Curva de exposição de alto contraste, como um filme fotográfico: sem
    // ela, a gama da tela mostra o vale de 39% entre as duas faixas como ~65%
    // de brilho e as faixas parecem uma só. Declarada no modal.
    for (let i = 0; i < SAMPLES; i += 1) {
      const x = peak > 0 ? Math.min(current[i]! / peak, 1) : 0;
      display[i] = x ** EXPOSURE_GAMMA;
    }
    screen?.setPattern(display);
  }

  /** Sorteia onde um elétron cai, em z de cena (relativo ao eixo). */
  function land(via: SlitSide | 'both'): number {
    const table = cdf[via];
    const total = table[SAMPLES - 1] ?? 0;
    if (!(total > 0)) return Number.NaN;
    const target = Math.random() * total;
    let lo = 0;
    let hi = SAMPLES - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (table[mid]! < target) lo = mid + 1;
      else hi = mid;
    }
    const step = store.get().screenWidth / SAMPLES;
    const X = positions[lo]! + (Math.random() - 0.5) * step;
    return X * MAGNIFICATION;
  }

  // --- Fatos para os textos ---------------------------------------------------
  function mode(state: Readonly<DoubleSlitState>): PatternMode {
    if (state.left && state.right) return state.detectors ? 'particle' : 'wave';
    if (state.left) return 'single-left';
    if (state.right) return 'single-right';
    return 'none';
  }

  function facts(): DoubleSlitFacts {
    const state = store.get();
    const geometry = geometryFor(state);
    return {
      mode: mode(state),
      wavelength: WAVELENGTH,
      voltage: DEFAULT_DOUBLE_SLIT.voltage,
      slitWidth: DEFAULT_DOUBLE_SLIT.slitWidth,
      separation: DEFAULT_DOUBLE_SLIT.separation,
      distance: state.distance,
      fringeSpacing: fringeSpacing(geometry),
      fringeCount: fringes,
      fresnelNumber: fresnelNumber(geometry),
      magnification: MAGNIFICATION,
    };
  }

  // --- Aplicar o estado na cena -------------------------------------------------
  const screenWidthScene = (): number => store.get().screenWidth * MAGNIFICATION;

  function applyGeometry(): void {
    const state = store.get();
    const L = state.distance;
    screenCarriage?.moveTo(railMm(LAYOUT.slitX + L));
    screen?.setWidth(screenWidthScene());
    beam?.setGeometry({ gunX: -LAYOUT.gunGap, screenX: L });
    wave?.setGeometry({
      length: L,
      halfWidth: screenWidthScene() / 2 + 0.02,
      slitZ: [
        (-DEFAULT_DOUBLE_SLIT.separation / 2) * MAGNIFICATION,
        (DEFAULT_DOUBLE_SLIT.separation / 2) * MAGNIFICATION,
      ],
      slitWidth: DEFAULT_DOUBLE_SLIT.slitWidth * MAGNIFICATION,
      // Ver wave-field.ts: com a ampliação M, a onda desenhada usa M²·λ.
      wavelength: MAGNIFICATION * MAGNIFICATION * WAVELENGTH,
    });
  }

  function applyVisibility(): void {
    const state = store.get();
    plate?.setOpen(state.left, state.right);
    plate?.setDetectors(state.detectors);
    beam?.setVisible(state.beamVisible);
    screen?.setHitsVisible(state.beamVisible);
    wave?.setOpen(state.left, state.right);
    wave?.setVisible(state.beamVisible && !state.detectors && (state.left || state.right));
  }

  function applyColor(): void {
    const hex = PHOSPHOR[store.get().color].hex;
    gun?.setTint(hex);
    screen?.setTint(hex);
    wave?.setTint(hex);
    beam?.setTint(hex);
  }

  function updateLabels(): void {
    if (!context) return;
    const en = locale === 'en';
    const state = store.get();
    context.labels.setText('ds-gun', en ? 'Electron gun · 50 kV' : 'Canhão de elétrons · 50 kV');
    context.labels.setText(
      'ds-slits',
      state.detectors
        ? en
          ? 'Slits · detectors on'
          : 'Fendas · detectores ligados'
        : en
          ? 'Slits · detectors off'
          : 'Fendas · detectores desligados',
    );
    context.labels.setText(
      'ds-screen',
      `${en ? 'Screen · drag' : 'Anteparo · arraste'} · ${formatDistance(state.distance * 1000, locale)}`,
    );
  }

  function applyState(previous?: Readonly<DoubleSlitState>): void {
    const state = store.get();
    const patternChanged =
      !previous ||
      previous.left !== state.left ||
      previous.right !== state.right ||
      previous.detectors !== state.detectors ||
      previous.distance !== state.distance ||
      previous.screenWidth !== state.screenWidth;
    if (!previous || previous.distance !== state.distance || previous.screenWidth !== state.screenWidth) {
      applyGeometry();
    }
    if (patternChanged) computePattern();
    applyVisibility();
    if (!previous || previous.color !== state.color) applyColor();
    updateLabels();
    context?.invalidate();
  }

  const clampDistance = (meters: number): number => Math.min(Math.max(meters, RANGE.min), RANGE.max);
  const clampWidth = (meters: number): number => Math.min(Math.max(meters, WIDTH_RANGE.min), WIDTH_RANGE.max);

  const onOff = (value: string | number | boolean): boolean =>
    typeof value === 'boolean' ? value : value === 'on' || value === 1 || value === 'true';

  function nextColor(): void {
    const index = PHOSPHOR_COLORS.indexOf(store.get().color);
    store.set({ color: PHOSPHOR_COLORS[(index + 1) % PHOSPHOR_COLORS.length]! });
  }

  return {
    id: 'double-slit',
    title: { 'pt-BR': 'A dupla fenda', en: 'The double slit' },

    setup(ctx: LabContext): Promise<void> {
      context = ctx;
      const { materials } = ctx;

      // --- Canhão ---------------------------------------------------------
      const gunCarriage = ctx.bench.mountAt(railMm(LAYOUT.slitX - LAYOUT.gunGap - LAYOUT.gunStandBack));
      disposers.push(() => gunCarriage.group.removeFromParent());
      gun = createElectronGun({ materials, axisHeight: AXIS_HEIGHT });
      gun.group.position.set(LAYOUT.gunStandBack, AXIS_HEIGHT, 0);
      gunCarriage.group.add(gun.group);
      for (const object of gun.glowing) ctx.addGlow(object);

      // --- Placa das fendas ------------------------------------------------
      const slitCarriage = ctx.bench.mountAt(railMm(LAYOUT.slitX));
      disposers.push(() => slitCarriage.group.removeFromParent());
      plate = createSlitPlate({
        materials,
        slitWidth: DEFAULT_DOUBLE_SLIT.slitWidth * MAGNIFICATION,
        separation: DEFAULT_DOUBLE_SLIT.separation * MAGNIFICATION,
      });
      slitRoot.position.y = AXIS_HEIGHT;
      slitRoot.add(plate.group);
      slitCarriage.group.add(slitRoot);
      for (const object of plate.glowing) ctx.addGlow(object);

      // Suporte da placa: do poste do carrinho até a borda de baixo dela.
      const standHeight = AXIS_HEIGHT - 0.16 - 0.05;
      const standGeometry = new THREE.BoxGeometry(0.03, standHeight, 0.06);
      standGeometry.translate(0, -0.16 - standHeight / 2, 0);
      geometries.push(standGeometry);
      const stand = new THREE.Mesh(standGeometry, materials.anodizedAluminum);
      stand.castShadow = true;
      slitRoot.add(stand);

      // --- Anteparo ---------------------------------------------------------
      const screenMount = ctx.bench.mountAt(railMm(LAYOUT.slitX + store.get().distance));
      screenCarriage = screenMount;
      disposers.push(() => screenMount.group.removeFromParent());
      screen = createPhosphorScreen({
        materials,
        width: screenWidthScene(),
        height: SCREEN_HEIGHT,
        samples: SAMPLES,
        axisHeight: AXIS_HEIGHT,
      });
      screen.group.position.y = AXIS_HEIGHT;
      screenMount.group.add(screen.group);
      // O anteparo fica fora do bloom: o brilho espalhado apagaria o vale entre
      // as duas faixas e as franjas finas.

      // --- Monitor do anteparo ------------------------------------------------
      // O anteparo fica de perfil para quem olha a bancada de frente; o
      // monitor, no fundo da bancada, mostra a mesma imagem de frente.
      const monitor = new THREE.Group();
      monitor.name = 'phosphor-monitor';
      const face = screen.createMonitorFace(MONITOR.width, MONITOR.width * (SCREEN_HEIGHT / 0.36));
      face.position.z = MONITOR.depth / 2 + 0.001;
      monitor.add(face);
      const faceHeight = MONITOR.width * (SCREEN_HEIGHT / 0.36);
      const caseGeometry = new THREE.BoxGeometry(MONITOR.width + 0.04, faceHeight + 0.04, MONITOR.depth);
      geometries.push(caseGeometry);
      const monitorCase = new THREE.Mesh(caseGeometry, materials.anodizedAluminum);
      monitorCase.castShadow = true;
      monitor.add(monitorCase);
      const benchTop = ctx.bench.railTopY - 0.052;
      const centerY = ctx.bench.railTopY + AXIS_HEIGHT + MONITOR.lift + faceHeight / 2;
      const poleHeight = centerY - benchTop;
      const poleGeometry = new THREE.CylinderGeometry(0.012, 0.012, poleHeight, 16);
      poleGeometry.translate(0, -poleHeight / 2, -MONITOR.depth / 2 - 0.012);
      const footGeometry = new THREE.CylinderGeometry(0.07, 0.08, 0.016, 32);
      footGeometry.translate(0, -poleHeight + 0.008, -MONITOR.depth / 2 - 0.012);
      geometries.push(poleGeometry, footGeometry);
      const pole = new THREE.Mesh(poleGeometry, materials.anodizedAluminum);
      const foot = new THREE.Mesh(footGeometry, materials.anodizedAluminum);
      pole.castShadow = true;
      monitor.add(pole, foot);
      monitor.position.set(LAYOUT.slitX + MONITOR.x, centerY, MONITOR.z);
      ctx.bench.group.add(monitor);
      disposers.push(() => monitor.removeFromParent());

      // --- Onda e feixe -----------------------------------------------------
      wave = createWaveField();
      slitRoot.add(wave.mesh);
      ctx.addGlow(wave.mesh);

      const plateRef = plate;
      const screenRef = screen;
      beam = createElectronBeam({
        slitZ: plateRef.slitZ,
        slitHalfHeight: plateRef.slitHalfHeight,
        slitWidth: DEFAULT_DOUBLE_SLIT.slitWidth * MAGNIFICATION,
        state: () => store.get(),
        land,
        onDetect: (side) => plateRef.flash(side),
        onHit: (z, y) => {
          const u = z / screenWidthScene() + 0.5;
          const v = 0.5 + y / SCREEN_HEIGHT;
          if (u >= 0 && u <= 1) screenRef.addHit(u, v);
        },
      });
      slitRoot.add(beam.group);
      for (const object of beam.glowing) ctx.addGlow(object);

      // --- Etiquetas 3D -----------------------------------------------------
      ctx.labels.add({ id: 'ds-gun', anchor: gun.group, offset: { x: -0.2, y: 0.13, z: 0 }, text: '' });
      ctx.labels.add({
        id: 'ds-slits',
        anchor: slitRoot,
        offset: { x: 0, y: 0.3, z: 0 },
        text: '',
        accent: '#C8923A',
      });
      ctx.labels.add({
        id: 'ds-screen',
        anchor: screen.group,
        offset: { x: 0, y: SCREEN_HEIGHT / 2 + 0.07, z: 0 },
        text: '',
      });
      disposers.push(() => {
        for (const id of ['ds-gun', 'ds-slits', 'ds-screen']) ctx.labels.remove(id);
      });

      // --- Arraste do anteparo ----------------------------------------------
      let dragDistance = store.get().distance;
      disposers.push(
        ctx.registerDraggable({
          targets: [screen.group],
          cursor: 'ew-resize',
          onDragStart: () => {
            dragDistance = store.get().distance;
          },
          onDrag: (event) => {
            dragDistance = clampDistance(dragDistance + (event.deltaX / DRAG_PIXELS) * (RANGE.max - RANGE.min));
            store.set({ distance: dragDistance });
          },
        }),
      );

      // --- Atalhos ----------------------------------------------------------
      const nudge = (direction: number): void =>
        store.set({ distance: clampDistance(Math.round((store.get().distance + direction * 0.05) * 100) / 100) });
      disposers.push(
        ctx.onKey('1', () => store.set({ left: !store.get().left })),
        ctx.onKey('2', () => store.set({ right: !store.get().right })),
        ctx.onKey('o', () => store.set({ detectors: !store.get().detectors })),
        ctx.onKey('v', () => store.set({ beamVisible: !store.get().beamVisible })),
        ctx.onKey('k', () => nextColor()),
        ctx.onKey('[', () => nudge(-1)),
        ctx.onKey(']', () => nudge(1)),
      );

      disposers.push(store.subscribe((_state, previous) => applyState(previous)));
      applyState();
      return Promise.resolve();
    },

    update(dt: number, elapsed: number): void {
      plate?.update(dt);
      beam?.update(dt);
      screen?.update(dt);
      wave?.update(elapsed);
      // O feixe anda sempre: o loop não pode dormir com ele visível.
      if (store.get().beamVisible) context?.invalidate();
    },

    set(id: string, value: string | number | boolean): void {
      switch (id) {
        case 'slits.left':
          store.set({ left: onOff(value) });
          break;
        case 'slits.right':
          store.set({ right: onOff(value) });
          break;
        case 'detectors':
          store.set({ detectors: onOff(value) });
          break;
        case 'beam':
          store.set({ beamVisible: onOff(value) });
          break;
        case 'color':
          if (typeof value === 'string' && (PHOSPHOR_COLORS as readonly string[]).includes(value)) {
            store.set({ color: value as PhosphorColor });
          }
          break;
        case 'distance':
          // O slider fala em mm, como a régua da bancada.
          store.set({ distance: clampDistance(Number(value) / 1000) });
          break;
        case 'screenWidth':
          store.set({ screenWidth: clampWidth(Number(value) * 1e-6) });
          break;
        default:
          break;
      }
    },

    get(id: string): string | number | boolean {
      const state = store.get();
      switch (id) {
        case 'slits.left':
          return state.left;
        case 'slits.right':
          return state.right;
        case 'detectors':
          return state.detectors ? 'on' : 'off';
        case 'beam':
          return state.beamVisible ? 'on' : 'off';
        case 'color':
          return state.color;
        case 'distance':
          return state.distance * 1000;
        case 'screenWidth':
          return state.screenWidth * 1e6;
        default:
          return 0;
      }
    },

    subscribe(listener: () => void): () => void {
      return store.subscribe(() => listener());
    },

    hud(hudLocale: Locale): HudModel {
      const copy = buildDoubleSlitCopy(facts());
      const f = facts();
      const en = hudLocale === 'en';
      const described = describeDoubleSlit(f, hudLocale);
      return {
        title: copy.title[hudLocale],
        subtitle: copy.subtitle[hudLocale],
        chips: [
          { id: 'wavelength', label: 'λ', value: `${formatNumber(f.wavelength * 1e12, 2, hudLocale)} pm` },
          {
            id: 'spacing',
            label: en ? 'Fringes' : 'Franjas',
            value: `${formatNumber(f.fringeSpacing * 1e6, 2, hudLocale)} µm`,
          },
          { id: 'pattern', label: en ? 'Pattern' : 'Padrão', value: patternLabel(f.mode, hudLocale) },
        ],
        sentence: described.sentence,
        highlights: described.highlights,
      };
    },

    numbers(numbersLocale: Locale): NumberRow[] {
      const f = facts();
      const state = store.get();
      const en = numbersLocale === 'en';
      const n = (value: number, decimals: number): string => formatNumber(value, decimals, numbersLocale);
      return [
        {
          id: 'voltage',
          label: en ? 'Accelerating voltage' : 'Tensão de aceleração',
          value: `${n(f.voltage / 1000, 0)} kV`,
        },
        {
          id: 'speed',
          label: en ? 'Electron speed' : 'Velocidade do elétron',
          value: `${n(electronSpeedFraction(f.voltage) * 100, 1)}% c`,
          hint: en ? 'Relativistic: γ = 1 + eV/mc²' : 'Relativística: γ = 1 + eV/mc²',
        },
        {
          id: 'wavelength',
          label: en ? 'de Broglie wavelength λ' : 'Comprimento de onda λ',
          value: `${n(f.wavelength * 1e12, 3)} pm`,
          hint: 'λ = h / p',
        },
        { id: 'slit', label: en ? 'Slit width a' : 'Largura da fenda a', value: `${n(f.slitWidth * 1e6, 1)} µm` },
        {
          id: 'separation',
          label: en ? 'Slit separation d' : 'Distância entre fendas d',
          value: `${n(f.separation * 1e6, 1)} µm`,
        },
        {
          id: 'distance',
          label: en ? 'Distance to screen L' : 'Distância ao anteparo L',
          value: `${n(f.distance, 2)} m`,
        },
        {
          id: 'spacing',
          label: en ? 'Fringe spacing' : 'Espaçamento das franjas',
          value: `${n(f.fringeSpacing * 1e6, 3)} µm`,
          hint: 'Δy = λL / d',
        },
        {
          id: 'fresnel',
          label: en ? 'Fresnel number' : 'Número de Fresnel',
          value: n(f.fresnelNumber, 2),
          hint: 'a² / (λL)',
        },
        {
          id: 'visible',
          label: en ? 'Maxima on the screen' : 'Máximos no anteparo',
          value: String(f.fringeCount),
          hint: en ? 'Above 15% of the brightest' : 'Acima de 15% do mais claro',
        },
        {
          id: 'screen',
          label: en ? 'Screen width' : 'Largura do anteparo',
          value: `${n(state.screenWidth * 1e6, 0)} µm`,
        },
        {
          id: 'magnification',
          label: en ? 'Drawing scale (across)' : 'Escala do desenho (transversal)',
          value: `${n(MAGNIFICATION, 0)}×`,
          hint: en ? '1 µm drawn as 1 cm' : '1 µm desenhado como 1 cm',
        },
      ];
    },

    setLocale(next: Locale): void {
      locale = next;
      updateLabels();
    },

    ui(): PanelSchema {
      const en = locale === 'en';
      // O painel põe as ferramentas na ponta da segunda linha, que precisa de
      // um slider para encolher: por isso o anteparo vem em segundo.
      return {
        groups: [
          {
            id: 'slits',
            label: { 'pt-BR': 'Fendas', en: 'Slits' },
            hint: { 'pt-BR': '1 2', en: '1 2' },
            controls: [
              {
                kind: 'checkboxes',
                id: 'slits',
                label: { 'pt-BR': 'Abertas', en: 'Open' },
                options: [
                  { value: 'left', label: en ? 'Left' : 'Esquerda' },
                  { value: 'right', label: en ? 'Right' : 'Direita' },
                ],
              },
              {
                kind: 'segmented',
                id: 'detectors',
                label: { 'pt-BR': 'Detectores · O', en: 'Detectors · O' },
                options: [
                  { value: 'off', label: en ? 'Off' : 'Desligados' },
                  { value: 'on', label: en ? 'On' : 'Ligados' },
                ],
              },
            ],
          },
          {
            id: 'screen',
            label: { 'pt-BR': 'Anteparo', en: 'Screen' },
            hint: { 'pt-BR': '[ ]', en: '[ ]' },
            controls: [
              {
                kind: 'slider',
                id: 'distance',
                label: { 'pt-BR': 'Distância', en: 'Distance' },
                min: RANGE.min * 1000,
                max: RANGE.max * 1000,
                step: 10,
                unit: 'mm',
              },
              {
                kind: 'slider',
                id: 'screenWidth',
                label: { 'pt-BR': 'Largura', en: 'Width' },
                min: WIDTH_RANGE.min * 1e6,
                max: WIDTH_RANGE.max * 1e6,
                step: 1,
                unit: 'µm',
                secondary: true,
              },
            ],
          },
          {
            id: 'beam',
            label: { 'pt-BR': 'Feixe', en: 'Beam' },
            hint: { 'pt-BR': 'V', en: 'V' },
            controls: [
              {
                kind: 'segmented',
                id: 'beam',
                label: { 'pt-BR': 'Feixe', en: 'Beam' },
                options: [
                  { value: 'on', label: en ? 'Visible' : 'Visível' },
                  { value: 'off', label: en ? 'Pattern only' : 'Só o padrão' },
                ],
              },
            ],
          },
          {
            id: 'color',
            label: { 'pt-BR': 'Cor do fósforo', en: 'Phosphor colour' },
            hint: { 'pt-BR': 'K', en: 'K' },
            controls: [
              {
                kind: 'segmented',
                id: 'color',
                label: { 'pt-BR': 'Cor do fósforo', en: 'Phosphor colour' },
                options: PHOSPHOR_COLORS.map((color) => ({ value: color, label: PHOSPHOR[color].label[locale] })),
              },
            ],
          },
        ],
      };
    },

    copy(): ExperimentCopy {
      return buildDoubleSlitCopy(facts());
    },

    cameras(): CinematicShot[] {
      const origin = new THREE.Vector3();
      slitRoot.updateWorldMatrix(true, false);
      slitRoot.getWorldPosition(origin);
      const L = store.get().distance;
      const gunX = origin.x - LAYOUT.gunGap;
      const screenX = origin.x + L;
      const gunBack = gunX - 0.5;
      const cx = (gunBack + screenX) / 2;
      const y = origin.y;
      const z = origin.z;

      return [
        {
          id: 'overview',
          label: { 'pt-BR': 'Bancada inteira', en: 'Whole bench' },
          position: { x: cx + 0.35, y: y + 1.25, z: z + 3.3 },
          target: { x: cx + 0.25, y: y + 0.02, z },
          fov: 40,
          portrait: {
            position: { x: cx + 1.9, y: y + 1.0, z: z + 3.0 },
            target: { x: cx + 0.15, y: y - 0.15, z },
            fov: 60,
          },
        },
        {
          id: 'screen',
          label: { 'pt-BR': 'O anteparo', en: 'The screen' },
          position: { x: screenX - 0.75, y: y + 0.16, z: z + 0.32 },
          target: { x: screenX, y, z },
          fov: 40,
        },
        {
          id: 'slits',
          label: { 'pt-BR': 'As fendas', en: 'The slits' },
          position: { x: origin.x - 0.5, y: y + 0.3, z: z + 0.6 },
          target: { x: origin.x + 0.05, y: y + 0.02, z },
          fov: 40,
        },
        {
          id: 'gun',
          label: { 'pt-BR': 'O canhão', en: 'The gun' },
          position: { x: gunX - 0.1, y: y + 0.05, z: z + 0.95 },
          target: { x: gunX - 0.25, y: y - 0.15, z },
          fov: 40,
        },
        {
          id: 'top',
          label: { 'pt-BR': 'De cima', en: 'From above' },
          position: { x: origin.x + L / 2, y: y + 1.9, z: z + 0.55 },
          target: { x: origin.x + L / 2, y, z },
          fov: 45,
        },
      ];
    },

    dispose(): void {
      beam?.dispose();
      wave?.dispose();
      screen?.dispose();
      plate?.dispose();
      gun?.dispose();
      for (const dispose of disposers) dispose();
      disposers.length = 0;
      for (const geometry of geometries) geometry.dispose();
      geometries.length = 0;
      slitRoot.clear();
      beam = null;
      wave = null;
      screen = null;
      plate = null;
      gun = null;
      screenCarriage = null;
      context = null;
    },
  };
}
