import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { MaterialLibrary } from './materials';

/**
 * TV retrô sobre a bancada: clicar nela abre o vídeo explicativo "Planka e as
 * Lentes" na frente da tela (ui/video-viewer.ts).
 *
 * Gabinete de madeira com cantos arredondados, antenas de latão em V, dois
 * botões de latão ao lado da tela e um filete neon ciano em volta dela, como
 * as telas do console. A tela mostra a capa do vídeo com um botão de play,
 * desenhada num canvas (sem brilho de bloom, para continuar legível).
 */

export interface VideoTv {
  readonly group: THREE.Group;
  /** A tela: alvo do clique e ponto de partida da animação do vídeo. */
  readonly screen: THREE.Mesh;
  /** Filete neon, para o bloom. */
  readonly glowing: THREE.Object3D[];
  /** Altura do topo das antenas, para a etiqueta. */
  readonly height: number;
  /** Troca a legenda da tela (idioma). */
  setCaption(caption: string): void;
  dispose(): void;
}

export interface VideoTvOptions {
  readonly materials: MaterialLibrary;
  /** Capa do vídeo (imagem 16:9). */
  readonly posterUrl: string;
  readonly title: string;
  readonly caption: string;
  /** Pede um quadro quando a capa termina de carregar. */
  readonly invalidate: () => void;
}

const BODY = { width: 0.36, height: 0.25, depth: 0.17, radius: 0.028 };
const FEET = 0.026;
const SCREEN = { width: 0.19, height: 0.107 };
/**
 * A tela fica à esquerda; à direita, a coluna dos botões. Com o filete neon,
 * ela ocupa de −0,135 a 0,097 na face plana do gabinete (−0,152 a 0,152):
 * a mesma folga dos dois lados até a borda e até os botões.
 */
const SCREEN_X = -0.019;
const NEON = '#7fe3ff';

export function createVideoTv({ materials, posterUrl, title, caption: initialCaption, invalidate }: VideoTvOptions): VideoTv {
  let caption = initialCaption;
  let posterReady = false;
  const group = new THREE.Group();
  group.name = 'video-tv';
  const geometries: THREE.BufferGeometry[] = [];
  const owned: THREE.Material[] = [];
  const glowing: THREE.Object3D[] = [];
  const bodyY = FEET + BODY.height / 2;
  const front = BODY.depth / 2;

  // --- Gabinete ---------------------------------------------------------------
  const bodyGeometry = new RoundedBoxGeometry(BODY.width, BODY.height, BODY.depth, 4, BODY.radius);
  geometries.push(bodyGeometry);
  const body = new THREE.Mesh(bodyGeometry, materials.trayWood);
  body.position.y = bodyY;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Moldura escura da tela, um pouco maior que ela.
  const bezelGeometry = new RoundedBoxGeometry(SCREEN.width + 0.03, SCREEN.height + 0.03, 0.012, 3, 0.012);
  geometries.push(bezelGeometry);
  const bezel = new THREE.Mesh(bezelGeometry, materials.darkSteel);
  bezel.position.set(SCREEN_X, bodyY, front);
  group.add(bezel);

  // --- Tela ---------------------------------------------------------------------
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 576;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  drawScreen(canvas, null, title, caption);
  const poster = new Image();
  poster.decoding = 'async';
  poster.onload = () => {
    posterReady = true;
    drawScreen(canvas, poster, title, caption);
    texture.needsUpdate = true;
    invalidate();
  };
  poster.src = posterUrl;

  const screenGeometry = new THREE.PlaneGeometry(SCREEN.width, SCREEN.height);
  geometries.push(screenGeometry);
  const screenMaterial = new THREE.MeshBasicMaterial({ map: texture });
  owned.push(screenMaterial);
  const screen = new THREE.Mesh(screenGeometry, screenMaterial);
  screen.name = 'video-tv-screen';
  screen.position.set(SCREEN_X, bodyY, front + 0.0065);
  group.add(screen);

  // Filete neon em volta da tela: um anel de retângulo arredondado.
  const ringGeometry = roundedRing(SCREEN.width + 0.042, SCREEN.height + 0.042, 0.004, 0.018);
  geometries.push(ringGeometry);
  const neonMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON).multiplyScalar(1.6) });
  owned.push(neonMaterial);
  const ring = new THREE.Mesh(ringGeometry, neonMaterial);
  ring.position.set(SCREEN_X, bodyY, front + 0.002);
  group.add(ring);
  glowing.push(ring);

  // --- Botões de latão e grade do alto-falante -----------------------------------------
  const knobX = SCREEN_X + SCREEN.width / 2 + 0.052;
  const knobGeometry = new THREE.CylinderGeometry(0.017, 0.019, 0.016, 32).rotateX(Math.PI / 2);
  geometries.push(knobGeometry);
  for (const y of [0.055, 0.005]) {
    const knob = new THREE.Mesh(knobGeometry, materials.brushedBrass);
    knob.position.set(knobX, bodyY + y, front + 0.008);
    knob.castShadow = true;
    group.add(knob);
  }
  const slotGeometry = new THREE.BoxGeometry(0.034, 0.004, 0.004);
  geometries.push(slotGeometry);
  for (let i = 0; i < 4; i++) {
    const slot = new THREE.Mesh(slotGeometry, materials.darkSteel);
    slot.position.set(knobX, bodyY - 0.045 - i * 0.013, front + 0.001);
    group.add(slot);
  }

  // --- Pés --------------------------------------------------------------------------
  const footGeometry = new THREE.CylinderGeometry(0.012, 0.016, FEET, 20).translate(0, FEET / 2, 0);
  geometries.push(footGeometry);
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const foot = new THREE.Mesh(footGeometry, materials.brushedBrass);
      foot.position.set(x * (BODY.width / 2 - 0.045), 0, z * (BODY.depth / 2 - 0.035));
      group.add(foot);
    }
  }

  // --- Antenas em V ---------------------------------------------------------------
  const top = FEET + BODY.height;
  const antennaLength = 0.24;
  const baseGeometry = new THREE.SphereGeometry(0.022, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const rodGeometry = new THREE.CylinderGeometry(0.0028, 0.0035, antennaLength, 10).translate(0, antennaLength / 2, 0);
  const tipGeometry = new THREE.SphereGeometry(0.008, 16, 8);
  geometries.push(baseGeometry, rodGeometry, tipGeometry);
  const base = new THREE.Mesh(baseGeometry, materials.brushedBrass);
  base.position.set(0, top, -0.02);
  group.add(base);
  for (const side of [-1, 1]) {
    const antenna = new THREE.Group();
    antenna.position.set(0, top + 0.012, -0.02);
    antenna.rotation.z = side * 0.5;
    antenna.rotation.x = -0.12;
    const rod = new THREE.Mesh(rodGeometry, materials.brushedBrass);
    const tip = new THREE.Mesh(tipGeometry, materials.brushedBrass);
    tip.position.y = antennaLength;
    antenna.add(rod, tip);
    group.add(antenna);
  }
  const height = top + antennaLength * Math.cos(0.5);

  return {
    group,
    screen,
    glowing,
    height,
    setCaption(next: string): void {
      if (next === caption) return;
      caption = next;
      drawScreen(canvas, posterReady ? poster : null, title, caption);
      texture.needsUpdate = true;
      invalidate();
    },
    dispose(): void {
      group.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of owned) material.dispose();
      texture.dispose();
      poster.onload = null;
    },
  };
}

/** Anel de retângulo arredondado (contorno de largura `thickness`), no plano XY. */
function roundedRing(width: number, height: number, thickness: number, radius: number): THREE.ShapeGeometry {
  const outer = roundedRect(width, height, radius);
  const inner = roundedRect(width - 2 * thickness, height - 2 * thickness, radius - thickness);
  outer.holes.push(inner);
  return new THREE.ShapeGeometry(outer, 12);
}

function roundedRect(width: number, height: number, radius: number): THREE.Shape {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

/** Capa (ou fundo escuro, enquanto ela carrega), botão de play e legenda. */
function drawScreen(canvas: HTMLCanvasElement, poster: HTMLImageElement | null, title: string, caption: string): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const { width: w, height: h } = canvas;
  g.fillStyle = '#0f1420';
  g.fillRect(0, 0, w, h);
  if (poster) {
    g.drawImage(poster, 0, 0, w, h);
  } else {
    g.fillStyle = '#eef2fa';
    g.font = '700 84px Outfit, "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.fillText(title, w / 2, h * 0.28);
  }
  // Leve vinheta e brilho de tubo.
  const vignette = g.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.62);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = vignette;
  g.fillRect(0, 0, w, h);

  // Botão de play no centro.
  const cx = w / 2;
  const cy = h * 0.56;
  const r = h * 0.16;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = 'rgba(10, 16, 28, 0.62)';
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = NEON;
  g.stroke();
  g.beginPath();
  g.moveTo(cx - r * 0.32, cy - r * 0.48);
  g.lineTo(cx + r * 0.52, cy);
  g.lineTo(cx - r * 0.32, cy + r * 0.48);
  g.closePath();
  g.fillStyle = '#ffffff';
  g.fill();

  // Faixa com a legenda embaixo.
  g.fillStyle = 'rgba(8, 12, 22, 0.78)';
  g.fillRect(0, h - 92, w, 92);
  g.fillStyle = NEON;
  g.font = '600 50px Outfit, "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(caption, w / 2, h - 46);
}
