import * as THREE from 'three';
import { createRenderer, resizeToDisplaySize } from './core/renderer';
import { createLoop } from './core/loop';
import { createCameraRig } from './core/camera';
import { createStatsPanel } from './core/stats';

declare global {
  interface Window {
    /** Sinalizador lido pelos testes do Playwright (e2e/shots.spec.ts). */
    __labReady?: boolean;
  }
}

const MAX_PIXEL_RATIO = 2;

function boot(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#scene');
  const app = document.querySelector<HTMLElement>('#app');
  const loading = document.querySelector<HTMLElement>('#loading');
  if (!canvas || !app) throw new Error('Canvas #scene ou container #app não encontrado');

  const renderer = createRenderer({ canvas, maxPixelRatio: MAX_PIXEL_RATIO });
  const { camera, controls, update: updateCamera } = createCameraRig({ canvas });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f1a);
  scene.fog = new THREE.Fog(0x0b0f1a, 6, 24);

  // --- Cena de validação da F0: um cubo sobre um piso, com órbita. ---
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x7fe3ff, roughness: 0.35, metalness: 0.1 }),
  );
  cube.position.y = 0.35;
  cube.castShadow = true;
  scene.add(cube);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: 0x131a28, roughness: 0.6, metalness: 0.0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(20, 40, 0x2a3750, 0x1a2231);
  grid.position.y = 0.001;
  scene.add(grid);

  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(2.5, 4, 2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 20;
  key.shadow.radius = 4;
  scene.add(key);
  scene.add(new THREE.HemisphereLight(0x9cb4ff, 0x0b0f1a, 0.6));
  // --- fim da cena de validação ---

  const loop = createLoop({
    onFrame: (dt) => {
      resizeToDisplaySize(renderer, camera, MAX_PIXEL_RATIO);
      updateCamera(dt);
      cube.rotation.y += dt * 0.4;
      renderer.render(scene, camera);
      stats.update();
    },
  });

  const stats = createStatsPanel(app, renderer, loop);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'p' || event.key === 'P') {
      if (import.meta.env.DEV) stats.toggle();
    }
    if (event.key === 'r' || event.key === 'R') {
      void controls.setLookAt(1.6, 1.1, 2.4, 0, 0.35, 0, true);
    }
  });

  loop.start();

  // Primeiro quadro pronto: some com a tela de carregamento e avisa o Playwright.
  requestAnimationFrame(() => {
    loading?.classList.add('loading--done');
    window.setTimeout(() => loading?.setAttribute('hidden', ''), 420);
    window.__labReady = true;
  });
}

boot();
