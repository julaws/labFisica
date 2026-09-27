import * as THREE from 'three';
import { createRenderer, resizeToDisplaySize } from './core/renderer';
import { createLoop } from './core/loop';
import { createCameraRig } from './core/camera';
import { createStatsPanel } from './core/stats';
import { createPostPipeline } from './core/post';
import { createQualityManager, detectQualityLevel } from './core/quality';
import { loadEnvironment } from './core/environment';
import { createLoadingScreen } from './core/loader';
import { createMaterialLibrary } from './scene/materials';
import { createLabRoom } from './scene/lab-room';
import { createBench } from './scene/bench';
import { disposeProceduralTextures } from './scene/textures/procedural';
import { createInputSystem } from './core/input';
import { createExperimentRegistry, experimentIdFromHash } from './core/experiment';
import { createLensFocusExperiment } from './experiments/lens-focus';

declare global {
  interface Window {
    /** Sinalizador lido pelos testes do Playwright (e2e/shots.spec.ts). */
    __labReady?: boolean;
    /** Diagnóstico exposto para as capturas e para o painel de estatísticas. */
    __lab?: { fps: number; frameMs: number; quality: string; drawCalls: number };
  }
}

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#scene');
  const app = document.querySelector<HTMLElement>('#app');
  if (!canvas || !app) throw new Error('Canvas #scene ou container #app não encontrado');

  const loading = createLoadingScreen();

  const renderer = createRenderer({ canvas });
  const quality = createQualityManager(detectQualityLevel(renderer));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.settings.maxPixelRatio));

  // A bancada é larga; num retrato de celular o mesmo enquadramento vira um
  // close na quina. A SPEC §3.3 pede a câmera padrão ajustada à proporção.
  const portrait = window.innerWidth / Math.max(1, window.innerHeight) < 0.85;
  const defaultView = portrait
    ? {
        fov: 46,
        position: { x: 2.15, y: 2.05, z: 5.1 },
        target: { x: -0.05, y: 1.12, z: -0.55 },
      }
    : {
        fov: 33,
        position: { x: 3.1, y: 2.35, z: 4.5 },
        target: { x: -0.15, y: 1.05, z: -0.5 },
      };

  const rig = createCameraRig({
    canvas,
    fov: defaultView.fov,
    near: 0.02,
    far: 60,
    position: defaultView.position,
    target: defaultView.target,
  });
  const { camera, controls } = rig;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a12);
  scene.fog = new THREE.FogExp2(0x070a12, 0.055);

  // --- Materiais e texturas procedurais ------------------------------------
  loading.begin('textures');
  const materials = createMaterialLibrary();
  loading.complete('textures');

  // --- Ambiente por HDRI ----------------------------------------------------
  loading.begin('environment');
  const environment = await loadEnvironment({
    renderer,
    scene,
    onProgress: (fraction) => loading.progress(fraction),
  });
  loading.complete('environment');

  // --- Sala e bancada -------------------------------------------------------
  loading.begin('room');
  const room = createLabRoom(materials);
  scene.add(room.group);

  const bench = createBench(materials);
  scene.add(bench.group);

  loading.complete('room');

  // --- Pós-processamento ----------------------------------------------------
  loading.begin('post');
  const post = createPostPipeline({ renderer, scene, camera, quality: quality.settings });
  for (const object of [...room.glowing, ...bench.glowing]) post.bloom.selection.add(object);
  loading.complete('post');

  // --- Qualidade adaptativa -------------------------------------------------
  const applyQuality = (): void => {
    const settings = quality.settings;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.maxPixelRatio));
    renderer.shadowMap.enabled = settings.shadows;
    renderer.transmissionResolutionScale = settings.transmissionScale;
    room.applyShadowQuality(settings.shadows, settings.shadowMapSize);
    post.applyQuality(settings);
    post.setSize(canvas.clientWidth, canvas.clientHeight);
  };
  quality.onChange(applyQuality);
  applyQuality();

  // --- Loop -----------------------------------------------------------------
  const loop = createLoop({
    onFrame: (dt, elapsed) => {
      renderer.info.reset();
      if (resizeToDisplaySize(renderer, camera, quality.settings.maxPixelRatio)) {
        post.setSize(canvas.clientWidth, canvas.clientHeight);
      }
      rig.update(dt);
      experiment?.update(dt, elapsed);
      post.render(dt);
      quality.sample(loop.frameMs);
      stats.update();

      window.__lab = {
        fps: loop.fps,
        frameMs: loop.frameMs,
        quality: quality.settings.level,
        drawCalls: renderer.info.render.calls,
      };
    },
  });

  const stats = createStatsPanel(app, renderer, loop);

  // --- Entrada e experimento ------------------------------------------------
  const input = createInputSystem({
    canvas,
    camera,
    setCameraEnabled: (value) => {
      controls.enabled = value;
    },
  });

  const registry = createExperimentRegistry();
  registry.register({
    id: 'lens-focus',
    title: { 'pt-BR': 'Lente e plano de foco', en: 'Lens and plane of focus' },
    create: createLensFocusExperiment,
  });

  const params = new URLSearchParams(window.location.search);
  const requestedId = experimentIdFromHash();
  const experiment =
    (requestedId ? registry.create(requestedId) : null) ?? registry.createDefault();

  if (experiment) {
    await experiment.setup({
      renderer,
      scene,
      camera,
      materials,
      room,
      bench,
      quality,
      addGlow: (object) => post.bloom.selection.add(object),
      registerDraggable: (handle) => input.registerDraggable(handle),
      onKey: (key, action) => input.onKey(key, action),
      invalidate: () => loop.invalidate(),
    });
  }

  if (import.meta.env.DEV) {
    // Handles de depuração: só existem no servidor de desenvolvimento.
    (window as unknown as { __labDebug: unknown }).__labDebug = {
      scene,
      camera,
      renderer,
      post,
      room,
      bench,
      quality,
    };
  }

  window.addEventListener('keydown', (event) => {
    if ((event.key === 'p' || event.key === 'P') && import.meta.env.DEV) stats.toggle();
    if (event.key === 'r' || event.key === 'R') {
      const { position: p, target: t } = defaultView;
      void controls.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, true);
    }
  });

  // ?lens=exploded&f=16&focus=2000 deixam a cena num estado conhecido sem
  // depender de atalhos de teclado, que dependem de foco e de tempo.
  if (experiment) {
    const lens = params.get('lens');
    if (lens) experiment.set('lensMode', lens);

    const fNumber = params.get('f');
    if (fNumber) experiment.set('fNumber', Number(fNumber));

    const focus = params.get('focus');
    if (focus) experiment.set('focusDistance', Number(focus));
  }

  // ?shot=<id> leva a câmera direto a um enquadramento cinematográfico do
  // experimento. É o que o script de capturas usa para fotografar a objetiva
  // de perto sem depender de interação.
  const requestedShot = params.get('shot');
  if (experiment && requestedShot) {
    const shot = experiment.cameras().find((candidate) => candidate.id === requestedShot);
    if (shot) {
      if (shot.fov !== undefined) {
        camera.fov = shot.fov;
        camera.updateProjectionMatrix();
      }
      void controls.setLookAt(
        shot.position.x,
        shot.position.y,
        shot.position.z,
        shot.target.x,
        shot.target.y,
        shot.target.z,
        false,
      );
    }
  }

  window.addEventListener('beforeunload', () => {
    loop.stop();
    experiment?.dispose();
    input.dispose();
    post.dispose();
    bench.dispose();
    room.dispose();
    materials.dispose();
    environment.dispose();
    disposeProceduralTextures();
    rig.dispose();
    renderer.dispose();
  });

  loop.start();

  // Espera dois quadros: o primeiro compila os shaders, o segundo já é o real.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      loading.finish();
      window.__labReady = true;
    });
  });
}

void boot().catch((error: unknown) => {
  console.error('Falha ao iniciar o laboratório', error);
  const step = document.querySelector<HTMLElement>('.loading__step');
  if (step) step.textContent = 'Não foi possível iniciar o laboratório.';
});
