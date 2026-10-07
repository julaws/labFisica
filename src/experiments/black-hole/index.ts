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
import type { QualitySettings } from '../../core/quality';
import {
  CRITICAL_IMPACT_PARAMETER,
  PHOTON_SPHERE_RADIUS,
  deflection,
  einsteinAngleWeakFar,
  einsteinRingAngle,
  gravitationalRadiusKm,
  impactParameter,
  keplerOmega,
  shadowAngularRadius,
  weakDeflection,
} from '../../optics/gravity/schwarzschild';
import { createEquationPlate } from '../../scene/equation-plate';
import { type ExplainerVideo, mountExplainerVideo } from '../../scene/explainer-video';
import videoPosterUrl from '../../assets/videos/planka-buraconegro.jpg?url';
import { formatNumber } from '../../ui/i18n';
import {
  type BlackHoleFacts,
  buildBlackHoleCopy,
  describeBlackHole,
  formatDegrees,
  formatKm,
  formatSolarMasses,
} from './copy';
import { BLACK_HOLE_PLATE } from './equation';
import { ORB_REGION_KM, type Orb, createOrb } from './orb';
import { type Sky, createSky } from './sky';
import { BLACK_HOLE_RANGES, createBlackHoleStore } from './state';
import { SCREEN_HEIGHT, type Telescope, createTelescope } from './telescope';
import { createTracerUniforms } from './tracer';

/**
 * Experimento "O buraco negro" (ADR 0017), na quinta bancada.
 *
 * Uma esfera de vidro com um buraco negro de Schwarzschild traçado pela
 * câmera real, e um telescópio cujo monitor mostra o que um observador
 * parado a uma distância escolhida veria. A estrela de fundo pode ser
 * alinhada para formar o anel de Einstein; o disco de acreção é opcional; a
 * visão didática troca o traçado pelo diagrama dos raios.
 */

/** Campo de visão vertical do telescópio, rad. */
const TELESCOPE_FOV = (64 * Math.PI) / 180;
/** A estrela conta como alinhada abaixo deste desvio, rad. */
const ALIGNED = (0.75 * Math.PI) / 180;
/**
 * Relógio do disco: uma volta na borda de dentro (r = 6M) leva 5 s. A de
 * verdade, para 10 M☉, leva menos de um milésimo de segundo (declarado).
 */
const DISK_CLOCK = (2 * Math.PI) / keplerOmega(6) / 5;

const DEG = Math.PI / 180;

/** Passos do traçado, passo em φ, resolução do telescópio e do céu, por nível. */
function tracerBudget(settings: QualitySettings): { steps: number; step: number; screen: number; sky: number } {
  if (settings.lightweight || settings.level === 'low') return { steps: 150, step: 0.055, screen: 512, sky: 1024 };
  if (settings.level === 'medium') return { steps: 200, step: 0.042, screen: 768, sky: 2048 };
  return { steps: 260, step: 0.032, screen: 960, sky: 2048 };
}

export function createBlackHoleExperiment(): Experiment {
  const store = createBlackHoleStore();
  let locale: Locale = 'pt-BR';
  let context: LabContext | null = null;
  let explainer: ExplainerVideo | null = null;
  const disposers: (() => void)[] = [];
  const uniforms = createTracerUniforms();

  let orb: Orb | null = null;
  let telescope: Telescope | null = null;
  let sky: Sky | null = null;
  const root = new THREE.Group();
  root.name = 'black-hole';

  // O anel exato custa uma bissecção: guardado por (massa, distância).
  let ringCache: { key: string; ring: number } | null = null;

  // --- Física ------------------------------------------------------------------
  function facts(): BlackHoleFacts {
    const state = store.get();
    const M = gravitationalRadiusKm(state.mass);
    // O observador nunca passa do horizonte (com folga).
    const distanceM = Math.max(state.distance / M, 2.05);
    const key = `${state.mass}|${state.distance}`;
    if (ringCache?.key !== key) ringCache = { key, ring: einsteinRingAngle(distanceM) };
    const ring = ringCache.ring;
    const ringImpact = impactParameter(distanceM, ring);
    const offset = Math.hypot(state.sourceX, state.sourceY) * DEG;
    return {
      mass: state.mass,
      gravitationalRadiusKm: M,
      horizonKm: 2 * M,
      photonSphereKm: PHOTON_SPHERE_RADIUS * M,
      criticalKm: CRITICAL_IMPACT_PARAMETER * M,
      distanceKm: distanceM * M,
      distanceM,
      shadow: shadowAngularRadius(distanceM),
      ring,
      ringWeak: einsteinAngleWeakFar(distanceM),
      ringImpact,
      ringDeflection: deflection(ringImpact),
      ringDeflectionWeak: weakDeflection(ringImpact),
      offset,
      aligned: offset < ALIGNED,
      insidePhotonSphere: distanceM < PHOTON_SPHERE_RADIUS,
      disk: state.disk === 'on',
      orbRegionKm: ORB_REGION_KM,
    };
  }

  // --- Cena ----------------------------------------------------------------------
  function applyState(): void {
    const state = store.get();
    const f = facts();
    const didactic = state.view === 'didactic';
    orb?.setRegion(ORB_REGION_KM / f.gravitationalRadiusKm);
    orb?.setDidactic(didactic);
    orb?.setDiskVisible(f.disk);
    uniforms.uDisk.value = f.disk ? 1 : 0;

    // A estrela, na direção oposta à do observador, deslocada no céu dele.
    const inclination = state.inclination * DEG;
    const observer = new THREE.Vector3(0, Math.sin(inclination), Math.cos(inclination));
    const forward = observer.clone().negate();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    uniforms.uSource.value
      .copy(forward)
      .addScaledVector(right, Math.tan(state.sourceX * DEG))
      .addScaledVector(up, Math.tan(state.sourceY * DEG))
      .normalize();

    telescope?.setView({
      distance: f.distanceM,
      inclination,
      fov: TELESCOPE_FOV,
      shadow: didactic ? f.shadow : -1,
      ring: didactic ? f.ring : -1,
      ringWeak: didactic ? f.ringWeak : -1,
      didactic,
    });
    updateLegend(f, didactic);
    setDiagramLabels(didactic);
    updateLabels();
    context?.invalidate();
  }

  function updateLegend(f: BlackHoleFacts, didactic: boolean): void {
    const en = locale === 'en';
    const title = `${en ? 'Telescope' : 'Telescópio'} · ${formatKm(f.distanceKm, locale)}`;
    if (!didactic) {
      telescope?.setLegend(
        [
          { color: '#7fe3ff', text: `${en ? 'shadow' : 'sombra'} ${formatDegrees(f.shadow, locale)}` },
          { color: '#ffd36b', text: `${en ? 'ring' : 'anel'} ${formatDegrees(f.ring, locale)}` },
        ],
        title,
      );
      return;
    }
    telescope?.setLegend(
      [
        { color: '#7fe3ff', text: `${en ? 'shadow' : 'sombra'} ${formatDegrees(f.shadow, locale)}` },
        { color: '#ffd36b', text: `${en ? 'Einstein ring' : 'anel de Einstein'} ${formatDegrees(f.ring, locale)}` },
        {
          color: '#ffd36b',
          text: `${en ? 'weak field' : 'campo fraco'} ${formatDegrees(f.ringWeak, locale)}`,
          dashed: true,
        },
      ],
      title,
    );
  }

  let diagramLabels = false;
  /** Etiquetas do diagrama, só na visão didática. */
  function setDiagramLabels(on: boolean): void {
    if (!context || !orb || on === diagramLabels) return;
    diagramLabels = on;
    const ids = ['bh-horizon', 'bh-photon', 'bh-critical'];
    if (!on) {
      for (const id of ids) context.labels.remove(id);
      return;
    }
    const { horizon, photon, critical } = orb.anchors;
    context.labels.add({ id: 'bh-horizon', anchor: horizon, offset: { x: 0, y: -0.6, z: 0 }, text: '' });
    context.labels.add({ id: 'bh-photon', anchor: photon, text: '', accent: '#ffd36b' });
    context.labels.add({ id: 'bh-critical', anchor: critical, text: '', accent: '#7fe3ff' });
  }

  function updateLabels(): void {
    if (!context) return;
    const en = locale === 'en';
    const f = facts();
    context.labels.setText(
      'bh-orb',
      `${en ? 'Black hole' : 'Buraco negro'} · ${formatSolarMasses(f.mass, locale)} · ${en ? 'horizon' : 'horizonte'} ${formatKm(f.horizonKm, locale)}`,
    );
    context.labels.setText(
      'bh-screen',
      `${en ? 'Telescope' : 'Telescópio'} · ${formatKm(f.distanceKm, locale)} · ${en ? 'shadow' : 'sombra'} ${formatDegrees(f.shadow, locale)}`,
    );
    if (diagramLabels) {
      context.labels.setText('bh-horizon', `${en ? 'Horizon' : 'Horizonte'} · 2M = ${formatKm(f.horizonKm, locale)}`);
      context.labels.setText(
        'bh-photon',
        `${en ? 'Photon sphere' : 'Esfera de fótons'} · 3M = ${formatKm(f.photonSphereKm, locale)}`,
      );
      context.labels.setText(
        'bh-critical',
        `${en ? 'Critical ray' : 'Raio crítico'} · b_c = 3√3 M = ${formatKm(f.criticalKm, locale)}`,
      );
    }
  }

  function applyQuality(settings: QualitySettings): void {
    const budget = tracerBudget(settings);
    uniforms.uStep.value = budget.step;
    orb?.setSteps(budget.steps);
    telescope?.setSteps(budget.steps);
    telescope?.setResolution(budget.screen);
  }

  const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);
  const { mass: massRange, distance: distanceRange, inclination: inclinationRange, source } = BLACK_HOLE_RANGES;

  function preset(name: string): void {
    switch (name) {
      case 'beautiful':
        store.set({ mass: 10, distance: 420, inclination: 7, sourceX: 6, sourceY: 4, disk: 'on', view: 'real' });
        break;
      case 'ring':
        store.set({ mass: 10, distance: 1500, inclination: 8, sourceX: 0, sourceY: 0, disk: 'off', view: 'real' });
        break;
      case 'close':
        store.set({ mass: 30, distance: 115, inclination: 14, sourceX: 4, sourceY: 2, disk: 'on', view: 'real' });
        break;
      case 'above':
        store.set({ mass: 10, distance: 500, inclination: 70, disk: 'on', view: 'real' });
        break;
      default:
        break;
    }
  }

  return {
    id: 'black-hole',
    title: { 'pt-BR': 'O buraco negro', en: 'The black hole' },

    setup(ctx: LabContext): Promise<void> {
      context = ctx;
      const { materials } = ctx;
      const budget = tracerBudget(ctx.quality.settings);
      uniforms.uStep.value = budget.step;

      root.position.set(0, ctx.bench.topY, 0);
      ctx.bench.group.add(root);
      disposers.push(() => root.removeFromParent());

      sky = createSky(ctx.renderer, budget.sky);
      uniforms.uSky.value = sky.texture;

      // --- A esfera de vidro, à esquerda ------------------------------------------
      orb = createOrb({ materials, uniforms, steps: budget.steps });
      orb.group.position.set(-0.62, 0, -0.06);
      root.add(orb.group);
      for (const object of orb.glowing) ctx.addGlow(object);

      // --- O telescópio, à direita --------------------------------------------------
      telescope = createTelescope({ materials, uniforms, steps: budget.steps, width: budget.screen });
      telescope.group.position.set(0.66, 0, -0.14);
      telescope.group.rotation.y = -0.2;
      root.add(telescope.group);
      for (const object of telescope.glowing) ctx.addGlow(object);

      // --- Placa da equação na frente da bancada -------------------------------
      const equation = createEquationPlate({ spec: BLACK_HOLE_PLATE, width: ctx.bench.width - 0.3, height: 0.46 });
      equation.mesh.position.set(0, ctx.bench.topY - 0.36, ctx.bench.frontZ + 0.006);
      ctx.bench.group.add(equation.mesh);
      disposers.push(() => {
        equation.mesh.removeFromParent();
        equation.dispose();
      });

      // --- TV do vídeo explicativo da Planka (tecla B) -------------------------
      explainer = mountExplainerVideo(
        ctx,
        {
          file: 'planka-buraconegro.mp4',
          poster: videoPosterUrl,
          title: { 'pt-BR': 'Planka e o Buraco Negro', en: 'Planka and the Black Hole' },
          description: {
            'pt-BR': 'O que é um buraco negro, a luz que faz a curva, a sombra, o anel de Einstein e o disco que brilha, com a Planka.',
            en: 'What a black hole is, light that bends, the shadow, the Einstein ring and the glowing disk, with Planka (in Portuguese).',
          },
          position: { x: ctx.bench.width / 2 - 0.24, y: ctx.bench.topY, z: ctx.bench.frontZ - 0.28 },
          rotationY: -0.35,
          scale: 0.7,
          key: 'b',
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

      // --- Etiquetas ------------------------------------------------------------------
      const orbRef = orb;
      const telescopeRef = telescope;
      ctx.labels.add({ id: 'bh-orb', anchor: orbRef.center, offset: { x: 0, y: 0.36, z: 0 }, text: '' });
      ctx.labels.add({
        id: 'bh-screen',
        anchor: telescopeRef.screen,
        offset: { x: 0, y: SCREEN_HEIGHT / 2 + 0.17, z: 0 },
        text: '',
        accent: '#ffd36b',
      });
      disposers.push(() => {
        ctx.labels.remove('bh-orb');
        ctx.labels.remove('bh-screen');
        setDiagramLabels(false);
      });

      // --- Atalhos -------------------------------------------------------------------
      const nudgeSource = (dx: number, dy: number): void => {
        const state = store.get();
        store.set({
          sourceX: clamp(Math.round((state.sourceX + dx) * 4) / 4, source.min, source.max),
          sourceY: clamp(Math.round((state.sourceY + dy) * 4) / 4, source.min, source.max),
        });
      };
      disposers.push(
        ctx.onKey('[', () => store.set({ mass: clamp(store.get().mass / 1.15, massRange.min, massRange.max) })),
        ctx.onKey(']', () => store.set({ mass: clamp(store.get().mass * 1.15, massRange.min, massRange.max) })),
        ctx.onKey('-', () =>
          store.set({ distance: clamp(store.get().distance / 1.2, distanceRange.min, distanceRange.max) }),
        ),
        ctx.onKey('=', () =>
          store.set({ distance: clamp(store.get().distance * 1.2, distanceRange.min, distanceRange.max) }),
        ),
        ctx.onKey('j', () => nudgeSource(-0.5, 0)),
        ctx.onKey('l', () => nudgeSource(0.5, 0)),
        ctx.onKey('i', () => nudgeSource(0, 0.5)),
        ctx.onKey('k', () => nudgeSource(0, -0.5)),
        ctx.onKey('o', () => store.set({ sourceX: 0, sourceY: 0 })),
        ctx.onKey('x', () => store.set({ disk: store.get().disk === 'on' ? 'off' : 'on' })),
        ctx.onKey('v', () => store.set({ view: store.get().view === 'real' ? 'didactic' : 'real' })),
      );

      disposers.push(ctx.quality.onChange((settings) => applyQuality(settings)));
      disposers.push(store.subscribe(() => applyState()));
      applyState();
      return Promise.resolve();
    },

    update(_dt: number, elapsed: number): void {
      uniforms.uDiskTime.value = elapsed * DISK_CLOCK;
      orb?.update(elapsed);
      if (context && telescope) telescope.render(context.renderer);
      // O disco gira e os fótons do diagrama andam: o loop não dorme.
      context?.invalidate();
    },

    set(id: string, value: string | number | boolean): void {
      switch (id) {
        case 'mass':
          store.set({ mass: clamp(Number(value), massRange.min, massRange.max) });
          break;
        case 'distance':
          store.set({ distance: clamp(Number(value), distanceRange.min, distanceRange.max) });
          break;
        case 'inclination':
          store.set({ inclination: clamp(Number(value), inclinationRange.min, inclinationRange.max) });
          break;
        case 'sourceX':
          store.set({ sourceX: clamp(Number(value), source.min, source.max) });
          break;
        case 'sourceY':
          store.set({ sourceY: clamp(Number(value), source.min, source.max) });
          break;
        case 'disk':
          if (value === 'on' || value === 'off') store.set({ disk: value });
          break;
        case 'view':
          if (value === 'real' || value === 'didactic') store.set({ view: value });
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
        case 'mass':
          return state.mass;
        case 'distance':
          return state.distance;
        case 'inclination':
          return state.inclination;
        case 'sourceX':
          return state.sourceX;
        case 'sourceY':
          return state.sourceY;
        case 'disk':
          return state.disk;
        case 'view':
          return state.view;
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
      const copy = buildBlackHoleCopy(f);
      const en = hudLocale === 'en';
      const described = describeBlackHole(f, hudLocale);
      return {
        title: copy.title[hudLocale],
        subtitle: copy.subtitle[hudLocale],
        chips: [
          { id: 'mass', label: en ? 'Mass' : 'Massa', value: formatSolarMasses(f.mass, hudLocale) },
          { id: 'horizon', label: en ? 'Horizon' : 'Horizonte', value: formatKm(f.horizonKm, hudLocale) },
          { id: 'shadow', label: en ? 'Shadow' : 'Sombra', value: formatDegrees(f.shadow, hudLocale) },
          { id: 'ring', label: en ? 'Ring' : 'Anel', value: formatDegrees(f.ring, hudLocale) },
        ],
        sentence: described.sentence,
        highlights: described.highlights,
      };
    },

    numbers(numbersLocale: Locale): NumberRow[] {
      const f = facts();
      const en = numbersLocale === 'en';
      const n = (value: number, decimals: number): string => formatNumber(value, decimals, numbersLocale);
      const arcsec = (radians: number): string => `${n((radians * 180 * 3600) / Math.PI, 0)}″`;
      return [
        { id: 'mass', label: en ? 'Mass M' : 'Massa M', value: formatSolarMasses(f.mass, numbersLocale) },
        {
          id: 'gravitational',
          label: en ? 'Gravitational radius GM/c²' : 'Raio gravitacional GM/c²',
          value: formatKm(f.gravitationalRadiusKm, numbersLocale),
        },
        {
          id: 'horizon',
          label: en ? 'Schwarzschild radius rₛ' : 'Raio de Schwarzschild rₛ',
          value: formatKm(f.horizonKm, numbersLocale),
          hint: 'rₛ = 2GM/c²',
        },
        {
          id: 'photon',
          label: en ? 'Photon sphere' : 'Esfera de fótons',
          value: formatKm(f.photonSphereKm, numbersLocale),
          hint: 'r = 3GM/c²',
        },
        {
          id: 'critical',
          label: en ? 'Critical impact parameter b_c' : 'Parâmetro de impacto crítico b_c',
          value: formatKm(f.criticalKm, numbersLocale),
          hint: 'b_c = 3√3 GM/c²',
        },
        {
          id: 'distance',
          label: en ? 'Telescope distance' : 'Distância do telescópio',
          value: `${formatKm(f.distanceKm, numbersLocale)} · ${n(f.distanceM, 1)} M`,
        },
        {
          id: 'shadow',
          label: en ? 'Shadow angular radius' : 'Raio angular da sombra',
          value: formatDegrees(f.shadow, numbersLocale),
          hint: 'sen ψ = b_c √(1 − 2M/r) / r',
        },
        {
          id: 'ring',
          label: en ? 'Einstein ring (exact)' : 'Anel de Einstein (exato)',
          value: formatDegrees(f.ring, numbersLocale),
          hint: en ? 'ray that reaches φ = π' : 'raio que chega a φ = π',
        },
        {
          id: 'ringWeak',
          label: en ? 'Einstein ring (weak field)' : 'Anel de Einstein (campo fraco)',
          value: formatDegrees(f.ringWeak, numbersLocale),
          hint: 'θ_E = √(4GM D_LS / (c² D_L D_S))',
        },
        {
          id: 'deflection',
          label: en ? 'Deflection of the ring ray' : 'Deflexão do raio do anel',
          value: `${formatDegrees(f.ringDeflection, numbersLocale)} · 4M/b: ${formatDegrees(f.ringDeflectionWeak, numbersLocale)}`,
          hint: `b = ${n(f.ringImpact, 1)} M`,
        },
        {
          id: 'sun',
          label: en ? 'Light grazing the Sun' : 'Luz rasante ao Sol',
          value: arcsec(deflection(695_700 / gravitationalRadiusKm(1))),
          hint: 'α ≈ 4GM/(c²b)',
        },
      ];
    },

    setLocale(next: Locale): void {
      locale = next;
      explainer?.setLocale(next);
      applyState();
    },

    ui(): PanelSchema {
      const en = locale === 'en';
      return {
        // O painel aberto cobriria o monitor do telescópio: começa minimizado.
        startCollapsed: true,
        groups: [
          {
            id: 'mass',
            label: { 'pt-BR': 'Massa', en: 'Mass' },
            hint: { 'pt-BR': '[ ]', en: '[ ]' },
            controls: [
              {
                kind: 'slider',
                id: 'mass',
                label: { 'pt-BR': 'Massa', en: 'Mass' },
                min: massRange.min,
                max: massRange.max,
                step: 0.1,
                logarithmic: true,
                unit: 'M☉',
                decimals: 1,
              },
            ],
          },
          {
            id: 'telescope',
            label: { 'pt-BR': 'Telescópio', en: 'Telescope' },
            hint: { 'pt-BR': '- =', en: '- =' },
            controls: [
              {
                kind: 'slider',
                id: 'distance',
                label: { 'pt-BR': 'Distância do telescópio', en: 'Telescope distance' },
                min: distanceRange.min,
                max: distanceRange.max,
                step: 1,
                logarithmic: true,
                unit: 'km',
                decimals: 0,
              },
              {
                kind: 'slider',
                id: 'inclination',
                label: { 'pt-BR': 'Altura', en: 'Height' },
                min: inclinationRange.min,
                max: inclinationRange.max,
                step: 1,
                unit: '°',
                decimals: 0,
                secondary: true,
              },
            ],
          },
          {
            id: 'source',
            label: { 'pt-BR': 'Estrela de fundo', en: 'Background star' },
            hint: { 'pt-BR': 'I J K L · O alinha', en: 'I J K L · O lines up' },
            controls: [
              {
                kind: 'slider',
                id: 'sourceX',
                label: { 'pt-BR': 'Estrela de fundo', en: 'Background star' },
                min: source.min,
                max: source.max,
                step: 0.05,
                unit: '°',
                decimals: 1,
              },
              {
                kind: 'slider',
                id: 'sourceY',
                label: { 'pt-BR': 'Vertical', en: 'Vertical' },
                min: source.min,
                max: source.max,
                step: 0.05,
                unit: '°',
                decimals: 1,
              },
            ],
          },
          {
            id: 'view',
            label: { 'pt-BR': 'Visão · V', en: 'View · V' },
            controls: [
              {
                kind: 'segmented',
                id: 'view',
                label: { 'pt-BR': 'Visão · V', en: 'View · V' },
                options: [
                  { value: 'real', label: en ? 'Realistic' : 'Realista' },
                  { value: 'didactic', label: en ? 'Didactic' : 'Didática' },
                ],
              },
              {
                kind: 'segmented',
                id: 'disk',
                label: { 'pt-BR': 'Disco · X', en: 'Disk · X' },
                options: [
                  { value: 'on', label: en ? 'On' : 'Ligado' },
                  { value: 'off', label: en ? 'Off' : 'Desligado' },
                ],
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
                  { value: 'ring', label: en ? 'Einstein ring' : 'Anel de Einstein' },
                  { value: 'close', label: en ? 'Very close' : 'Bem pertinho' },
                  { value: 'above', label: en ? 'Disk from above' : 'Disco de cima' },
                ],
              },
            ],
          },
        ],
      };
    },

    copy(): ExperimentCopy {
      return buildBlackHoleCopy(facts());
    },

    cameras(): CinematicShot[] {
      const origin = new THREE.Vector3();
      root.updateWorldMatrix(true, false);
      root.getWorldPosition(origin);
      const orbCenter = new THREE.Vector3();
      orb?.center.getWorldPosition(orbCenter);
      const screen = new THREE.Vector3();
      telescope?.screen.getWorldPosition(screen);
      const { x, y, z } = origin;
      return [
        {
          id: 'overview',
          label: { 'pt-BR': 'Bancada inteira', en: 'Whole bench' },
          position: { x, y: y + 0.62, z: z + 2.85 },
          target: { x, y: y + 0.3, z },
          fov: 40,
          // No celular, de viés pela direita: a esfera na frente e o monitor
          // inteiro atrás dela.
          portrait: {
            position: { x: x + 0.55, y: y + 0.85, z: z + 2.75 },
            target: { x: x + 0.04, y: y + 0.36, z },
            fov: 62,
          },
        },
        {
          id: 'orb',
          label: { 'pt-BR': 'A esfera', en: 'The sphere' },
          position: { x: orbCenter.x + 0.08, y: orbCenter.y + 0.06, z: orbCenter.z + 1.15 },
          target: { x: orbCenter.x, y: orbCenter.y, z: orbCenter.z },
          fov: 40,
        },
        {
          id: 'screen',
          label: { 'pt-BR': 'O telescópio', en: 'The telescope' },
          position: { x: screen.x - 0.2, y: screen.y + 0.05, z: screen.z + 1.25 },
          target: { x: screen.x, y: screen.y, z: screen.z },
          fov: 40,
        },
        {
          id: 'orb-above',
          label: { 'pt-BR': 'De cima', en: 'From above' },
          position: { x: orbCenter.x, y: orbCenter.y + 1.0, z: orbCenter.z + 0.55 },
          target: { x: orbCenter.x, y: orbCenter.y, z: orbCenter.z },
          fov: 40,
        },
      ];
    },

    dispose(): void {
      orb?.dispose();
      telescope?.dispose();
      sky?.dispose();
      for (const dispose of disposers) dispose();
      disposers.length = 0;
      root.clear();
      orb = null;
      telescope = null;
      sky = null;
      uniforms.uSky.value = null;
      context = null;
    },
  };
}
