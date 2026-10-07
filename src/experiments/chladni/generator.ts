import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
  const caseGeometry = mergeGeometries([
    new THREE.BoxGeometry(width, height, depth).translate(0, height / 2 + 0.012, 0),
    // Pezinhos.
    new THREE.BoxGeometry(0.05, 0.012, 0.05).translate(-width / 2 + 0.05, 0.006, depth / 2 - 0.05),
    new THREE.BoxGeometry(0.05, 0.012, 0.05).translate(width / 2 - 0.05, 0.006, depth / 2 - 0.05),
    new THREE.BoxGeometry(0.05, 0.012, 0.05).translate(-width / 2 + 0.05, 0.006, -depth / 2 + 0.05),
    new THREE.BoxGeometry(0.05, 0.012, 0.05).translate(width / 2 - 0.05, 0.006, -depth / 2 + 0.05),
  ]);
  if (!caseGeometry) throw new Error('Falha ao montar o gerador');
  geometries.push(caseGeometry);
  const box = new THREE.Mesh(caseGeometry, materials.darkSteel);
  box.castShadow = true;
  box.receiveShadow = true;
  group.add(box);

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
  const displayWidth = 0.27;
  const displayGeometry = new THREE.PlaneGeometry(displayWidth, displayWidth * (400 / 1024));
  geometries.push(displayGeometry);
  const display = new THREE.Mesh(displayGeometry, displayMaterial);
  display.position.set(-0.05, 0.012 + height / 2 + 0.005, depth / 2 + 0.002);
  group.add(display);
  glowing.push(display);

  // Botão de sintonia e bornes.
  const knobGeometry = new THREE.CylinderGeometry(0.03, 0.032, 0.03, 32).rotateX(Math.PI / 2);
  geometries.push(knobGeometry);
  const knob = new THREE.Mesh(knobGeometry, materials.knurledRubber);
  knob.position.set(width / 2 - 0.06, 0.012 + height / 2 + 0.02, depth / 2 + 0.015);
  group.add(knob);
  const jackGeometry = mergeGeometries([
    new THREE.CylinderGeometry(0.009, 0.009, 0.02, 16).rotateX(Math.PI / 2).translate(width / 2 - 0.085, 0.05, depth / 2 + 0.01),
    new THREE.CylinderGeometry(0.009, 0.009, 0.02, 16).rotateX(Math.PI / 2).translate(width / 2 - 0.04, 0.05, depth / 2 + 0.01),
  ]);
  if (!jackGeometry) throw new Error('Falha ao montar os bornes');
  geometries.push(jackGeometry);
  group.add(new THREE.Mesh(jackGeometry, materials.brushedBrass));

  // Cabo do borne até a base do excitador (em coordenadas do grupo).
  const start = new THREE.Vector3(width / 2 - 0.04, 0.05, depth / 2 + 0.02);
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
