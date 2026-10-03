import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../scene/materials';
import { COLLECTOR_X } from './layout';

/**
 * Coletor e contador (ADR 0011): um copo de Faraday na altura do feixe, do
 * outro lado do muro, com um anel que pisca a cada elétron que tunelou, e um
 * painel que conta os que tunelaram e os que refletiram — a fração medida
 * converge para o T do motor, elétron a elétron.
 */

export interface CounterReading {
  readonly title: string;
  readonly rows: readonly (readonly [string, string])[];
  /** Linha de destaque embaixo (a corrente de tunelamento). */
  readonly footer: string;
}

export interface Collector {
  readonly group: THREE.Group;
  readonly glowing: THREE.Object3D[];
  readonly labelAnchor: THREE.Object3D;
  setBaseline(y: number): void;
  /** Pisca o anel: um elétron chegou. */
  flash(): void;
  showReading(reading: CounterReading): void;
  update(dt: number): void;
  dispose(): void;
}

export interface CollectorOptions {
  readonly materials: MaterialLibrary;
}

export function createCollector({ materials }: CollectorOptions): Collector {
  const group = new THREE.Group();
  group.name = 'tunneling-collector';
  const geometries: THREE.BufferGeometry[] = [];
  const owned: (THREE.Material | THREE.Texture)[] = [];
  const glowing: THREE.Object3D[] = [];

  // Copo e haste, numa peça que sobe e desce com o feixe.
  const cup = new THREE.Group();
  group.add(cup);
  const cupGeometry = mergeGeometries([
    new THREE.CylinderGeometry(0.055, 0.055, 0.12, 32, 1, true).rotateZ(Math.PI / 2).translate(0.06, 0, 0),
    new THREE.CylinderGeometry(0.055, 0.055, 0.008, 32).rotateZ(Math.PI / 2).translate(0.12, 0, 0),
  ]);
  if (!cupGeometry) throw new Error('Falha ao montar o coletor');
  geometries.push(cupGeometry);
  const copper = new THREE.MeshStandardMaterial({ color: 0xc27a4a, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide });
  owned.push(copper);
  const cupMesh = new THREE.Mesh(cupGeometry, copper);
  cupMesh.castShadow = true;
  cup.add(cupMesh);

  const ringGeometry = new THREE.TorusGeometry(0.058, 0.006, 10, 40).rotateY(Math.PI / 2);
  geometries.push(ringGeometry);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffd36b, toneMapped: false });
  owned.push(ringMaterial);
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  cup.add(ring);
  glowing.push(ring);

  const stemGeometry = new THREE.CylinderGeometry(0.01, 0.014, 1, 12).translate(0, -0.5, 0);
  geometries.push(stemGeometry);
  const stem = new THREE.Mesh(stemGeometry, materials.anodizedAluminum);
  stem.position.x = 0.07;
  cup.add(stem);

  // --- Painel de contagem -----------------------------------------------------------
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para o contador');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  owned.push(texture);
  const screenMaterial = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  owned.push(screenMaterial);
  const screenWidth = 0.46;
  const screenHeight = screenWidth * (canvas.height / canvas.width);
  const screenGeometry = new THREE.PlaneGeometry(screenWidth, screenHeight);
  geometries.push(screenGeometry);
  const screen = new THREE.Mesh(screenGeometry, screenMaterial);
  const caseGeometry = mergeGeometries([
    new THREE.BoxGeometry(screenWidth + 0.03, screenHeight + 0.03, 0.03).translate(0, 0, -0.016),
    new THREE.BoxGeometry(0.03, 0.4, 0.03).translate(0, -screenHeight / 2 - 0.2, -0.03),
  ]);
  if (!caseGeometry) throw new Error('Falha ao montar o painel do contador');
  geometries.push(caseGeometry);
  const display = new THREE.Group();
  display.add(screen, new THREE.Mesh(caseGeometry, materials.anodizedAluminum));
  display.position.set(COLLECTOR_X - 0.16, 0.3, -0.22);
  display.rotation.y = -0.25;
  group.add(display);

  const labelAnchor = new THREE.Object3D();
  labelAnchor.position.set(COLLECTOR_X + 0.06, 0, 0);
  group.add(labelAnchor);

  cup.position.x = COLLECTOR_X;
  let level = 0;

  return {
    group,
    glowing,
    labelAnchor,

    setBaseline(y: number): void {
      cup.position.y = y;
      labelAnchor.position.y = y + 0.1;
      stem.scale.y = Math.max(y, 0.01);
    },

    flash(): void {
      level = 1;
    },

    showReading(reading: CounterReading): void {
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = '#0b1020';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255, 211, 107, 0.6)';
      ctx.lineWidth = 6;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      ctx.fillStyle = '#ffd36b';
      ctx.font = '700 40px Outfit, ui-sans-serif, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(reading.title, 40, 62);
      ctx.font = '500 36px "DM Mono", ui-monospace, monospace';
      reading.rows.forEach(([label, value], index) => {
        const y = 140 + index * 64;
        ctx.fillStyle = '#9fb0d0';
        ctx.fillText(label, 40, y);
        ctx.fillStyle = '#eef4ff';
        ctx.textAlign = 'right';
        ctx.fillText(value, w - 40, y);
        ctx.textAlign = 'left';
      });
      ctx.fillStyle = '#8ee8ff';
      ctx.font = '700 40px "DM Mono", ui-monospace, monospace';
      ctx.fillText(reading.footer, 40, h - 56);
      texture.needsUpdate = true;
    },

    update(dt: number): void {
      level = Math.max(0, level - dt * 3);
      ringMaterial.color.setRGB(1, 0.83, 0.42).multiplyScalar(0.35 + level * 2.5);
    },

    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const item of owned) item.dispose();
      group.clear();
    },
  };
}
