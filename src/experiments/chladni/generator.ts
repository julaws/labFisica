import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HardwareKit, bncJack, groupGeometries, indicatorLed, instrumentCase, panelKnob, pose, screenBezel } from '../../scene/hardware';
import type { MaterialLibrary } from '../../scene/materials';

/**
 * Gerador de funções (ADR 0018): a caixa que alimenta o excitador da placa,
 * com um visor que mostra a frequência, o modo e o quanto a placa está em
 * ressonância, e um cabo até o excitador.
 */

export interface GeneratorReading {
  readonly frequency: string;
  readonly mode: string;
  /** 0 a 1: a barra de ressonância. */
  readonly resonance: number;
  readonly status: string;
}

export interface Generator {
  readonly group: THREE.Group;
  readonly display: THREE.Mesh;
  readonly glowing: THREE.Object3D[];
  show(reading: GeneratorReading): void;
  dispose(): void;
}

export function createGenerator(materials: MaterialLibrary, cableTo: THREE.Vector3): Generator {
  const group = new THREE.Group();
  group.name = 'chladni-generator';
  const geometries: THREE.BufferGeometry[] = [];
  const owned: (THREE.Material | THREE.Texture)[] = [];
  const glowing: THREE.Object3D[] = [];

  const width = 0.42;
  const height = 0.2;
  const depth = 0.26;
  // Gabinete de instrumento: cantos arredondados, painel frontal anodizado
  // com parafusos, pés de borracha, ventilação e alças cromadas.
  const kit = new HardwareKit();
  const front = instrumentCase(kit, pose(0, 0, 0), { width, height, depth, handles: true, radius: 0.012 });
  const mid = front.bottom + height / 2;

  // Visor.
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para o gerador');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  owned.push(texture);
  const displayMaterial = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  owned.push(displayMaterial);
  const displayWidth = 0.25;
  const displayHeight = displayWidth * (400 / 1024);
  const displayGeometry = new THREE.PlaneGeometry(displayWidth, displayHeight);
  geometries.push(displayGeometry);
  const display = new THREE.Mesh(displayGeometry, displayMaterial);
  const displayY = mid + 0.025;
  display.position.set(-0.055, displayY, front.frontZ + 0.003);
  group.add(display);
  glowing.push(display);
  screenBezel(kit, pose(-0.055, displayY, front.frontZ - 0.001), { width: displayWidth, height: displayHeight, border: 0.01, depth: 0.005 });

  // Botão grande de sintonia, dois menores (amplitude e forma de onda),
  // as saídas BNC e a chave de liga.
  panelKnob(kit, pose(width / 2 - 0.065, mid + 0.03, front.frontZ), 0.026);
  panelKnob(kit, pose(-0.13, mid - 0.06, front.frontZ), 0.013);
  panelKnob(kit, pose(-0.06, mid - 0.06, front.frontZ), 0.013);
  const jacks: [number, number][] = [
    [width / 2 - 0.085, front.bottom + 0.042],
    [width / 2 - 0.04, front.bottom + 0.042],
  ];
  for (const [x, y] of jacks) bncJack(kit, pose(x, y, front.frontZ), 1.3);
  kit.add('rubber', new RoundedBoxGeometry(0.026, 0.034, 0.012, 2, 0.004).translate(-width / 2 + 0.05, mid - 0.06, front.frontZ + 0.004));
  kit.add('chrome', new RoundedBoxGeometry(0.018, 0.012, 0.01, 2, 0.003).translate(-width / 2 + 0.05, mid - 0.052, front.frontZ + 0.011));
  const hardware = kit.build(materials, 'chladni-generator-case');
  geometries.push(...groupGeometries(hardware));
  group.add(hardware);
  const led = indicatorLed(0x8dffcf, 0.0035);
  led.position.set(-width / 2 + 0.05, mid - 0.028, front.frontZ + 0.003);
  geometries.push(led.geometry);
  owned.push(led.material as THREE.Material);
  group.add(led);
  glowing.push(led);

  // Cabo do borne até a base do excitador (em coordenadas do grupo).
  const start = new THREE.Vector3(width / 2 - 0.04, front.bottom + 0.042, front.frontZ + 0.02);
  const end = cableTo.clone();
  const curve = new THREE.CatmullRomCurve3([
    start,
    new THREE.Vector3(start.x + 0.05, 0.012, start.z + 0.12),
    new THREE.Vector3((start.x + end.x) / 2, 0.01, Math.max(start.z, end.z) + 0.1),
    new THREE.Vector3(end.x + 0.1, 0.012, end.z + 0.08),
    end,
  ]);
  const cableGeometry = new THREE.TubeGeometry(curve, 64, 0.006, 8, false);
  geometries.push(cableGeometry);
  const cableMaterial = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.55, metalness: 0 });
  owned.push(cableMaterial);
  const cable = new THREE.Mesh(cableGeometry, cableMaterial);
  cable.castShadow = true;
  group.add(cable);

  return {
    group,
    display,
    glowing,

    show(reading: GeneratorReading): void {
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = '#04110c';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(120, 255, 200, 0.35)';
      ctx.lineWidth = 6;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#8dffcf';
      ctx.font = '700 132px "DM Mono", ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(reading.frequency, w - 50, 110);
      ctx.textAlign = 'left';
      ctx.font = '600 52px "DM Mono", ui-monospace, monospace';
      ctx.fillStyle = '#d6ffe9';
      ctx.fillText(reading.mode, 46, 232);
      // Barra de ressonância.
      ctx.fillStyle = 'rgba(141, 255, 207, 0.18)';
      ctx.fillRect(46, 288, w - 92, 30);
      ctx.fillStyle = reading.resonance >= 0.5 ? '#ffd36b' : '#8dffcf';
      ctx.fillRect(46, 288, (w - 92) * Math.min(Math.max(reading.resonance, 0), 1), 30);
      ctx.font = '500 40px "DM Mono", ui-monospace, monospace';
      ctx.fillStyle = '#9fd8bf';
      ctx.fillText(reading.status, 46, 356);
      texture.needsUpdate = true;
    },

    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const item of owned) item.dispose();
      group.clear();
    },
  };
}
