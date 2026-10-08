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
  type Flight,
  G0,
  ORBITAL_SPEED,
  STAGE_SPLITS,
  type Vehicle,
  buildVehicle,
  exhaustVelocity,
  idealDeltaV,
  liftoffMass,
  sampleAt,
  simulateFlight,
  tsiolkovsky,
} from '../../optics/mechanics/rocket';
import { createEquationPlate } from '../../scene/equation-plate';
import { type ExplainerVideo, mountExplainerVideo } from '../../scene/explainer-video';
import videoPosterUrl from '../../assets/videos/planka-foguete.jpg?url';
import { formatNumber } from '../../ui/i18n';
import { type RocketConsole, createRocketConsole } from './console';
import {
  type ChallengeVerdict,
  type RocketFacts,
  buildRocketCopy,
  describeRocket,
  formatAltitude,
  formatKmS,
  formatTons,
} from './copy';
import { ROCKET_PLATE } from './equation';
import { type SkyView, createSkyView } from './skyview';
import { CHALLENGE, DRAG_AREA, PAYLOAD, ROCKET_RANGES, createRocketStore } from './state';
import { type Vehicle3D, createVehicle } from './vehicle';

/**
 * Experimento "O foguete" (ADR 0020), na oitava bancada.
 *
 * O voo é integrado de uma vez pelo motor (RK4 de massa variável, com
 * gravidade e arrasto opcionais) e reproduzido em tempo acelerado: o foguete
 * paira na frente de uma janela cujo céu escurece com a altitude, os estágios
 * se soltam, e o console mostra o momento do foguete, do gás e dos estágios, a
 * velocidade contra a curva de Tsiolkovsky, a massa e Δv × razão de massas.
 */

/** Tempo de voo depois da última queima, s. */
const COAST = 40;
/** O voo inteiro dura cerca disto na tela, s. */
const PLAYBACK = 22;

export function createRocketExperiment(): Experiment {
  const store = createRocketStore();
  let locale: Locale = 'pt-BR';
  let context: LabContext | null = null;
  let explainer: ExplainerVideo | null = null;
  const disposers: (() => void)[] = [];
  const root = new THREE.Group();
  root.name = 'rocket';

  let vehicle3d: Vehicle3D | null = null;
  let sky: SkyView | null = null;
  let console3d: RocketConsole | null = null;

  let design: Vehicle | null = null;
  let flight: Flight | null = null;
  let clock = 0;
  let hudClock = 0;
  let consoleDirty = true;

  // --- Física ------------------------------------------------------------------
  function currentDesign(): Vehicle {
    const state = store.get();
    return buildVehicle({
      propellant: state.propellant,
      dryMass: state.dryMass,
      isp: state.isp,
      massFlow: state.massFlow,
      stages: state.stages,
      payload: PAYLOAD,
      dragArea: DRAG_AREA,
    });
  }

  function recompute(): void {
    const state = store.get();
    design = currentDesign();
    flight = simulateFlight(design, { gravity: state.gravity === 'on', drag: state.drag === 'on', dt: 0.1, coast: COAST });
    consoleDirty = true;
  }

  const burnTime = (): number => flight?.burnouts.at(-1) ?? 0;
  const warp = (): number => Math.max(3, ((flight?.samples.at(-1)?.t ?? 1) || 1) / PLAYBACK);

  function verdictOf(f: Flight, v: Vehicle, maxGs: number): ChallengeVerdict {
    const state = store.get();
    if (f.cannotLiftOff) return 'grounded';
    if (state.dryMass < CHALLENGE.minDryFraction * state.propellant) return 'fragile';
    if (liftoffMass(v) > CHALLENGE.budget) return 'heavy';
    if (maxGs > CHALLENGE.maxGs) return 'crushed';
    return f.burnout.velocity >= ORBITAL_SPEED ? 'orbit' : 'short';
  }

  function facts(): RocketFacts {
    if (!flight || !design) recompute();
    const f = flight!;
    const v = design!;
    const state = store.get();
    const now = sampleAt(f, state.status === 'ready' ? 0 : clock);
    const m0 = liftoffMass(v);
    const last = v.stages.at(-1)!;
    const finalMass = v.payload + last.dryMass;
    const ideal = idealDeltaV(v);
    const maxGs = Math.max(...f.samples.map((s) => s.acceleration)) / G0 + 1;
    const first = v.stages[0]!;
    const thrust = exhaustVelocity(first.isp) * first.massFlow;
    const verdict = state.challenge ? verdictOf(f, v, maxGs) : f.cannotLiftOff ? 'grounded' : 'none';
    const efficiency = PAYLOAD / m0;
    return {
      stages: v.stages.length,
      liftoffMass: m0,
      exhaust: exhaustVelocity(state.isp),
      idealDeltaV: ideal.total,
      massRatio: m0 / finalMass,
      burnoutVelocity: f.burnout.velocity,
      gravityLoss: f.burnout.gravityLoss,
      dragLoss: f.burnout.dragLoss,
      burnoutAltitude: f.burnout.altitude,
      velocity: now.velocity,
      altitude: now.altitude,
      acceleration: now.acceleration,
      thrust: state.status === 'ready' ? thrust : now.thrust,
      mass: now.mass,
      time: now.t,
      maxGs,
      thrustToWeight: thrust / (m0 * G0),
      gravity: state.gravity === 'on',
      drag: state.drag === 'on',
      flying: state.status === 'flying',
      done: state.status === 'done',
      challenge: state.challenge,
      verdict,
      efficiency,
      stars: verdict === 'orbit' ? (efficiency >= 0.03 ? 3 : efficiency >= 0.02 ? 2 : 1) : 0,
    };
  }

  /** Velocidade de Tsiolkovsky (sem perdas) no instante t do voo. */
  function idealAt(t: number): number {
    if (!flight || !design) return 0;
    let v = 0;
    let start = 0;
    let m = liftoffMass(design);
    design.stages.forEach((stage, index) => {
      const end = flight!.burnouts[index] ?? start;
      const burning = Math.min(Math.max(t - start, 0), end - start);
      v += tsiolkovsky(exhaustVelocity(stage.isp), m, m - stage.massFlow * burning);
      m -= stage.propellant + stage.dryMass;
      start = end;
    });
    return v;
  }

  // --- Cena ----------------------------------------------------------------------
  let lastShape = '';
  let lastKey = '';
  function applyState(): void {
    const state = store.get();
    // O relógio muda durante o voo: só refaz a física quando o foguete muda.
    const key = [state.propellant, state.dryMass, state.isp, state.massFlow, state.stages, state.gravity, state.drag].join('|');
    if (key !== lastKey || !flight) {
      lastKey = key;
      recompute();
    }
    if (state.status === 'flying') {
      lastShape = `${state.stages}|flying`;
      updateLabels();
      return;
    }
    // Na plataforma, o foguete é remontado inteiro (os estágios soltos voltam).
    const shape = `${state.stages}|${state.status}`;
    if (vehicle3d && shape !== lastShape && state.status === 'ready') vehicle3d.build(STAGE_SPLITS[state.stages]);
    lastShape = shape;
    if (state.status === 'ready') {
      clock = 0;
      showFrame();
    }
    updateLabels();
    context?.invalidate();
  }

  function showFrame(): void {
    if (!flight || !vehicle3d) return;
    const state = store.get();
    const t = state.status === 'ready' ? 0 : clock;
    const sample = sampleAt(flight, t);
    const burning = state.status === 'flying' && sample.stage >= 0 && t < burnTime();
    vehicle3d.setFlight(sample.altitude, burning, exhaustVelocity(state.isp));
    vehicle3d.setDropped(flight.burnouts.filter((b) => b <= t).length);
    sky?.setAltitude(sample.altitude);
  }

  function updateLabels(): void {
    if (!context) return;
    const en = locale === 'en';
    const f = facts();
    context.labels.setText(
      'rk-rocket',
      `${en ? 'Rocket' : 'Foguete'} · ${formatTons(f.liftoffMass, locale)} · ${f.stages} ${
        f.stages === 1 ? (en ? 'stage' : 'estágio') : en ? 'stages' : 'estágios'
      }`,
    );
    context.labels.setText(
      'rk-sky',
      `${en ? 'Altitude' : 'Altitude'} ${formatAltitude(f.altitude, locale)} · ${formatKmS(f.velocity, locale)}`,
    );
    context.labels.setText('rk-console', en ? 'Momentum and graphs' : 'Momento e gráficos');
  }

  function launch(): void {
    if (store.get().status === 'flying') return;
    if (store.get().status === 'done') {
      store.set({ status: 'ready' });
    }
    clock = 0;
    store.set({ status: 'flying' });
  }

  const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

  /** Mudar o foguete no meio do voo volta para a plataforma. */
  const edit = (patch: Partial<ReturnType<typeof store.get>>): void => store.set({ ...patch, status: 'ready' });

  function preset(name: string): void {
    switch (name) {
      case 'launch':
        launch();
        break;
      case 'reset':
        store.set({ status: 'ready' });
        break;
      case 'beautiful':
        // Três estágios a hidrogênio: as separações e a Terra se curvando.
        edit({ propellant: 150_000, dryMass: 12_000, isp: 440, massFlow: 900, stages: 3, gravity: 'on', drag: 'on' });
        launch();
        break;
      case 'challenge': {
        const on = !store.get().challenge;
        edit(on ? { challenge: true, gravity: 'on', drag: 'on' } : { challenge: false });
        break;
      }
      default:
        break;
    }
  }

  return {
    id: 'rocket',
    title: { 'pt-BR': 'O foguete', en: 'The rocket' },

    setup(ctx: LabContext): Promise<void> {
      context = ctx;
      root.position.set(0, ctx.bench.topY, 0);
      ctx.bench.group.add(root);
      disposers.push(() => root.removeFromParent());
      const low = ctx.quality.settings.lightweight || ctx.quality.settings.level === 'low';

      sky = createSkyView(ctx.materials, 0.95, 1.2);
      sky.group.position.set(-0.72, 0, -0.28);
      root.add(sky.group);
      for (const object of sky.glowing) ctx.addGlow(object);

      vehicle3d = createVehicle(ctx.materials);
      vehicle3d.group.position.set(-0.72, 0, 0.12);
      root.add(vehicle3d.group);
      for (const object of vehicle3d.glowing) ctx.addGlow(object);

      console3d = createRocketConsole(ctx.materials, low ? 'low' : 'high');
      console3d.group.position.set(0.72, 0, -0.08);
      console3d.group.rotation.y = -0.18;
      root.add(console3d.group);
      for (const object of console3d.glowing) ctx.addGlow(object);
      // As telas usam as fontes da web: redesenha quando elas terminam de carregar.
      void document.fonts.ready.then(() => {
        consoleDirty = true;
        context?.invalidate();
      });

      const equation = createEquationPlate({ spec: ROCKET_PLATE, width: ctx.bench.width - 0.3, height: 0.46 });
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
          file: 'planka-foguete.mp4',
          poster: videoPosterUrl,
          title: { 'pt-BR': 'Planka e o Foguete', en: 'Planka and the Rocket' },
          description: {
            'pt-BR': 'A Planka mostra como um foguete sobe empurrando o próprio gás: ação e reação, o momento que se conserva, a equação de Tsiolkovsky, os estágios e a órbita.',
            en: 'Planka shows how a rocket climbs by pushing its own gas: action and reaction, conserved momentum, the Tsiolkovsky equation, staging and orbit.',
          },
          position: { x: -0.06, y: ctx.bench.topY, z: ctx.bench.frontZ - 0.2 },
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

      const rocketAnchor = new THREE.Object3D();
      rocketAnchor.position.set(0, 0.82, 0);
      vehicle3d.group.add(rocketAnchor);
      const skyAnchor = new THREE.Object3D();
      skyAnchor.position.set(0.3, 1.3, 0);
      sky.group.add(skyAnchor);
      ctx.labels.add({ id: 'rk-rocket', anchor: rocketAnchor, text: '' });
      ctx.labels.add({ id: 'rk-sky', anchor: skyAnchor, text: '', accent: '#ffd36b' });
      ctx.labels.add({ id: 'rk-console', anchor: console3d.anchor, text: '', accent: '#8dffcf' });
      disposers.push(() => {
        for (const id of ['rk-rocket', 'rk-sky', 'rk-console']) ctx.labels.remove(id);
      });

      const { propellant } = ROCKET_RANGES;
      disposers.push(
        ctx.onKey('l', () => launch()),
        ctx.onKey('k', () => store.set({ status: 'ready' })),
        ctx.onKey('1', () => edit({ stages: 1 })),
        ctx.onKey('2', () => edit({ stages: 2 })),
        ctx.onKey('3', () => edit({ stages: 3 })),
        ctx.onKey('g', () => edit({ gravity: store.get().gravity === 'on' ? 'off' : 'on' })),
        ctx.onKey('h', () => edit({ drag: store.get().drag === 'on' ? 'off' : 'on' })),
        ctx.onKey('[', () => edit({ propellant: clamp(store.get().propellant / 1.15, propellant.min, propellant.max) })),
        ctx.onKey(']', () => edit({ propellant: clamp(store.get().propellant * 1.15, propellant.min, propellant.max) })),
      );

      lastShape = '';
      disposers.push(store.subscribe(() => applyState()));
      applyState();
      return Promise.resolve();
    },

    update(dt: number, elapsed: number): void {
      const state = store.get();
      if (state.status === 'flying' && flight) {
        clock += dt * warp();
        const end = flight.samples.at(-1)!.t;
        if (clock >= end) {
          clock = end;
          store.set({ status: 'done' });
        }
        showFrame();
        consoleDirty = true;
        // O HUD e o painel "Números" leem a store: avisa umas 5 vezes por segundo.
        hudClock += dt;
        if (hudClock >= 0.2 || store.get().status === 'done') {
          hudClock = 0;
          store.set({ clock });
        }
      }
      vehicle3d?.update(dt);
      sky?.update(elapsed);
      if (consoleDirty && flight && design && console3d) {
        const ideal = idealDeltaV(design);
        console3d.draw(
          {
            flight,
            now: sampleAt(flight, state.status === 'ready' ? 0 : clock),
            exhaust: exhaustVelocity(state.isp),
            massRatios: ideal.massRatios,
            stageDeltaV: ideal.stages,
            target: state.challenge,
            ideal: idealAt,
          },
          locale,
        );
        consoleDirty = false;
      }
      // O jato, os estágios caindo e as nuvens se mexem: o loop não dorme.
      context?.invalidate();
    },

    set(id: string, value: string | number | boolean): void {
      const { propellant, dryMass, isp, massFlow } = ROCKET_RANGES;
      switch (id) {
        case 'propellant':
          edit({ propellant: clamp(Number(value) * 1000, propellant.min, propellant.max) });
          break;
        case 'dryMass':
          edit({ dryMass: clamp(Number(value) * 1000, dryMass.min, dryMass.max) });
          break;
        case 'isp':
          edit({ isp: clamp(Number(value), isp.min, isp.max) });
          break;
        case 'massFlow':
          edit({ massFlow: clamp(Number(value), massFlow.min, massFlow.max) });
          break;
        case 'stages': {
          const n = Number(value);
          if (n === 1 || n === 2 || n === 3) edit({ stages: n });
          break;
        }
        case 'gravity':
          if (value === 'on' || value === 'off') edit({ gravity: value });
          break;
        case 'drag':
          if (value === 'on' || value === 'off') edit({ drag: value });
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
        case 'propellant':
          return state.propellant / 1000;
        case 'dryMass':
          return state.dryMass / 1000;
        case 'isp':
          return state.isp;
        case 'massFlow':
          return state.massFlow;
        case 'stages':
          return state.stages;
        case 'gravity':
          return state.gravity;
        case 'drag':
          return state.drag;
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
      const copy = buildRocketCopy(f);
      const en = hudLocale === 'en';
      const described = describeRocket(f, hudLocale);
      const reached = f.flying || f.done ? f.velocity : f.burnoutVelocity;
      return {
        title: copy.title[hudLocale],
        subtitle: copy.subtitle[hudLocale],
        chips: [
          { id: 'ideal', label: en ? 'Δv ideal' : 'Δv ideal', value: formatKmS(f.idealDeltaV, hudLocale) },
          { id: 'reached', label: f.flying || f.done ? (en ? 'Speed' : 'Velocidade') : en ? 'Δv reached' : 'Δv alcançado', value: formatKmS(reached, hudLocale) },
          { id: 'ratio', label: 'm₀/m_f', value: formatNumber(f.massRatio, 1, hudLocale) },
          { id: 'altitude', label: en ? 'Altitude' : 'Altitude', value: formatAltitude(f.altitude, hudLocale) },
        ],
        sentence: described.sentence,
        highlights: described.highlights,
      };
    },

    numbers(numbersLocale: Locale): NumberRow[] {
      const f = facts();
      const en = numbersLocale === 'en';
      const n = (value: number, decimals: number): string => formatNumber(value, decimals, numbersLocale);
      return [
        { id: 'm0', label: en ? 'Launch mass m₀' : 'Massa no lançamento m₀', value: formatTons(f.liftoffMass, numbersLocale) },
        { id: 've', label: en ? 'Exhaust velocity vₑ' : 'Velocidade do gás vₑ', value: formatKmS(f.exhaust, numbersLocale), hint: 'vₑ = Isp · g₀' },
        { id: 'ideal', label: en ? 'Ideal Δv (Tsiolkovsky)' : 'Δv ideal (Tsiolkovsky)', value: formatKmS(f.idealDeltaV, numbersLocale), hint: 'Σ vₑ ln(m₀/m_f)' },
        { id: 'burnout', label: en ? 'Speed at burnout' : 'Velocidade no fim das queimas', value: formatKmS(f.burnoutVelocity, numbersLocale) },
        { id: 'gravityLoss', label: en ? 'Gravity loss' : 'Perda por gravidade', value: formatKmS(f.gravityLoss, numbersLocale), hint: '∫ g dt' },
        { id: 'dragLoss', label: en ? 'Drag loss' : 'Perda por arrasto', value: formatKmS(f.dragLoss, numbersLocale), hint: '∫ D/m dt' },
        { id: 'thrust', label: en ? 'Thrust (stage 1)' : 'Empuxo (1º estágio)', value: `${n(f.thrust / 1000, 0)} kN`, hint: 'F = vₑ · dm/dt' },
        { id: 'twr', label: en ? 'Thrust / weight at liftoff' : 'Empuxo / peso na decolagem', value: n(f.thrustToWeight, 2) },
        { id: 'acceleration', label: en ? 'Acceleration now' : 'Aceleração agora', value: `${n(f.acceleration, 1)} m/s² · ${n(f.acceleration / G0, 2)} g` },
        { id: 'maxG', label: en ? 'Peak acceleration' : 'Aceleração máxima', value: `${n(f.maxGs, 1)} g` },
        { id: 'burn', label: en ? 'Total burn time' : 'Tempo total de queima', value: `${n(burnTime(), 0)} s` },
        { id: 'apex', label: en ? 'Altitude at burnout' : 'Altitude no fim das queimas', value: formatAltitude(f.burnoutAltitude, numbersLocale) },
      ];
    },

    setLocale(next: Locale): void {
      locale = next;
      explainer?.setLocale(next);
      consoleDirty = true;
      applyState();
    },

    ui(): PanelSchema {
      const en = locale === 'en';
      const challenge = store.get().challenge;
      return {
        groups: [
          {
            id: 'mass',
            label: { 'pt-BR': 'Propelente', en: 'Propellant' },
            hint: { 'pt-BR': '[ ]', en: '[ ]' },
            controls: [
              {
                kind: 'slider',
                id: 'propellant',
                label: { 'pt-BR': 'Propelente', en: 'Propellant' },
                min: ROCKET_RANGES.propellant.min / 1000,
                max: ROCKET_RANGES.propellant.max / 1000,
                step: 0.1,
                logarithmic: true,
                unit: 't',
                decimals: 0,
              },
              {
                kind: 'slider',
                id: 'dryMass',
                label: { 'pt-BR': 'Massa seca', en: 'Dry mass' },
                min: ROCKET_RANGES.dryMass.min / 1000,
                max: ROCKET_RANGES.dryMass.max / 1000,
                step: 0.1,
                logarithmic: true,
                unit: 't',
                decimals: 1,
              },
            ],
          },
          {
            id: 'engine',
            label: { 'pt-BR': 'Isp', en: 'Isp' },
            controls: [
              {
                kind: 'slider',
                id: 'isp',
                label: { 'pt-BR': 'Isp', en: 'Isp' },
                min: ROCKET_RANGES.isp.min,
                max: ROCKET_RANGES.isp.max,
                step: 1,
                unit: 's',
                decimals: 0,
              },
              {
                kind: 'slider',
                id: 'massFlow',
                label: { 'pt-BR': 'Vazão', en: 'Mass flow' },
                min: ROCKET_RANGES.massFlow.min,
                max: ROCKET_RANGES.massFlow.max,
                step: 1,
                logarithmic: true,
                unit: 'kg/s',
                decimals: 0,
              },
            ],
          },
          {
            id: 'stages',
            label: { 'pt-BR': 'Estágios · 1 2 3', en: 'Stages · 1 2 3' },
            controls: [
              {
                kind: 'segmented',
                id: 'stages',
                label: { 'pt-BR': 'Estágios · 1 2 3', en: 'Stages · 1 2 3' },
                options: [
                  { value: 1, label: '1' },
                  { value: 2, label: '2' },
                  { value: 3, label: '3' },
                ],
              },
              {
                kind: 'segmented',
                id: 'gravity',
                label: { 'pt-BR': 'Gravidade · G', en: 'Gravity · G' },
                options: [
                  { value: 'on', label: en ? 'On' : 'Sim' },
                  { value: 'off', label: en ? 'Off' : 'Não' },
                ],
              },
              {
                kind: 'segmented',
                id: 'drag',
                label: { 'pt-BR': 'Ar · H', en: 'Air · H' },
                options: [
                  { value: 'on', label: en ? 'On' : 'Sim' },
                  { value: 'off', label: en ? 'Off' : 'Não' },
                ],
              },
            ],
          },
          {
            id: 'flight',
            label: { 'pt-BR': 'Voo · L K', en: 'Flight · L K' },
            controls: [
              {
                kind: 'actions',
                id: 'action',
                label: { 'pt-BR': 'Voo · L K', en: 'Flight · L K' },
                options: [
                  { value: 'launch', label: en ? 'Launch ▲' : 'Lançar ▲' },
                  { value: 'reset', label: en ? 'Back to the pad' : 'Voltar à plataforma' },
                  { value: 'beautiful', label: en ? 'Show me something beautiful' : 'Mostre-me algo bonito', accent: true },
                  {
                    value: 'challenge',
                    label: challenge ? (en ? 'Leave the challenge' : 'Sair do desafio') : en ? 'Orbit challenge ★' : 'Desafio da órbita ★',
                  },
                ],
              },
            ],
          },
        ],
      };
    },

    copy(): ExperimentCopy {
      return buildRocketCopy(facts());
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
          position: { x, y: y + 0.85, z: z + 2.75 },
          target: { x, y: y + 0.45, z },
          fov: 40,
          portrait: {
            position: { x: x - 0.15, y: y + 1.0, z: z + 2.9 },
            target: { x: x - 0.25, y: y + 0.5, z },
            fov: 66,
          },
        },
        {
          id: 'rocket',
          label: { 'pt-BR': 'O foguete', en: 'The rocket' },
          position: { x: x - 0.55, y: y + 0.55, z: z + 1.35 },
          target: { x: x - 0.72, y: y + 0.5, z: z - 0.1 },
          fov: 40,
        },
        {
          id: 'console',
          label: { 'pt-BR': 'O console', en: 'The console' },
          position: { x: x + 0.72, y: y + 0.65, z: z + 1.1 },
          target: { x: x + 0.72, y: y + 0.38, z: z - 0.1 },
          fov: 40,
        },
      ];
    },

    dispose(): void {
      vehicle3d?.dispose();
      sky?.dispose();
      console3d?.dispose();
      for (const dispose of disposers) dispose();
      disposers.length = 0;
      root.clear();
      vehicle3d = null;
      sky = null;
      console3d = null;
      context = null;
    },
  };
}
