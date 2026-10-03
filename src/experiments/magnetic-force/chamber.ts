import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../scene/materials';
import {
  APERTURE,
  BEAM_Y,
  CHAMBER_RADIUS,
  INNER_TUBE,
  NECK_JOIN_X,
  NECK_RADIUS,
  NOZZLE_X,
  SELECTOR,
} from './apparatus';

/**
 * Câmara de vidro, gargalo e seletor de velocidades (ADR 0010), no
 * referencial do centro da câmara (ver `apparatus.ts`). Escala 1:1.
 *
 * O vidro é barato de propósito: transparente com reflexo, sem transmissão
 * física (cara demais para uma esfera de meio metro na tela inteira).
 */

export interface Chamber {
  readonly group: THREE.Group;
  /** Âncoras para as etiquetas. */
  readonly selectorAnchor: THREE.Object3D;
  /** Liga o brilho das placas e das bobinas do seletor. */
  setSelector(on: boolean): void;
  dispose(): void;
}

export interface ChamberOptions {
  readonly materials: MaterialLibrary;
  /** Distância do centro da câmara até o tampo da bancada, m. */
  readonly centerHeight: number;
}

export function createChamber({ materials, centerHeight }: ChamberOptions): Chamber {
  const group = new THREE.Group();
  group.name = 'magnetic-chamber';
  const geometries: THREE.BufferGeometry[] = [];
  const owned: THREE.Material[] = [];
  const keep = <T extends THREE.BufferGeometry>(geometry: T): T => {
    geometries.push(geometry);
    return geometry;
  };

  // --- Vidro: esfera, gargalo e o corpo do seletor ----------------------------
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xd8ecff,
    roughness: 0.04,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
    envMapIntensity: 1.4,
  });
  owned.push(glass);
  const along = (geometry: THREE.BufferGeometry, x0: number, x1: number): THREE.BufferGeometry =>
    geometry.rotateZ(-Math.PI / 2).translate((x0 + x1) / 2, BEAM_Y, 0);
  const selectorMid = (SELECTOR.start + SELECTOR.end) / 2;
  const glassGeometry = mergeGeometries([
    new THREE.SphereGeometry(CHAMBER_RADIUS, 64, 40),
    along(new THREE.CylinderGeometry(NECK_RADIUS, NECK_RADIUS, NECK_JOIN_X - NOZZLE_X, 24, 1, true), NOZZLE_X, NECK_JOIN_X),
    along(new THREE.CylinderGeometry(0.045, 0.045, 0.18, 32, 1, true), selectorMid - 0.09, selectorMid + 0.09),
  ]);
  if (!glassGeometry) throw new Error('Falha ao montar o vidro da câmara');
  const glassMesh = new THREE.Mesh(keep(glassGeometry), glass);
  glassMesh.renderOrder = 2;
  group.add(glassMesh);

  // --- Metal: tubo interno, fenda, colar e suporte ----------------------------
  const standHeight = centerHeight - CHAMBER_RADIUS;
  const metalGeometry = mergeGeometries([
    // Tubo interno blindado, de onde o feixe sai dentro da câmara.
    along(new THREE.CylinderGeometry(INNER_TUBE.radius, INNER_TUBE.radius, INNER_TUBE.end - NECK_JOIN_X, 20), NECK_JOIN_X, INNER_TUBE.end),
    // Disco da fenda na saída do seletor.
    along(new THREE.CylinderGeometry(0.04, 0.04, 0.004, 32), APERTURE.x - 0.002, APERTURE.x + 0.002),
    // Colar na junção do gargalo com a esfera.
    along(new THREE.CylinderGeometry(NECK_RADIUS + 0.008, NECK_RADIUS + 0.008, 0.03, 24), NECK_JOIN_X - 0.03, NECK_JOIN_X),
    // Suporte da esfera, do tampo até embaixo dela, com um pé largo.
    new THREE.CylinderGeometry(0.02, 0.026, standHeight, 20).translate(0, -CHAMBER_RADIUS - standHeight / 2, 0),
    new THREE.CylinderGeometry(0.06, 0.07, 0.018, 32).translate(0, -centerHeight + 0.009, 0),
    // Taça que segura a esfera.
    new THREE.CylinderGeometry(0.05, 0.03, 0.03, 32).translate(0, -CHAMBER_RADIUS + 0.004, 0),
  ]);
  if (!metalGeometry) throw new Error('Falha ao montar as peças de metal da câmara');
  const metal = new THREE.Mesh(keep(metalGeometry), materials.anodizedAluminum);
  metal.castShadow = true;
  group.add(metal);

  // --- Seletor: placas e bobinas ----------------------------------------------
  const plateMaterial = new THREE.MeshStandardMaterial({
    color: 0x9aa3ad,
    metalness: 0.9,
    roughness: 0.3,
    emissive: new THREE.Color(0x3b82f6),
    emissiveIntensity: 0,
  });
  owned.push(plateMaterial);
  const plateGeometry = mergeGeometries([
    new THREE.BoxGeometry(SELECTOR.end - SELECTOR.start, 0.002, 0.032).translate(selectorMid, BEAM_Y + SELECTOR.gap / 2 + 0.001, 0),
    new THREE.BoxGeometry(SELECTOR.end - SELECTOR.start, 0.002, 0.032).translate(selectorMid, BEAM_Y - SELECTOR.gap / 2 - 0.001, 0),
  ]);
  if (!plateGeometry) throw new Error('Falha ao montar as placas do seletor');
  group.add(new THREE.Mesh(keep(plateGeometry), plateMaterial));

  // Bobinas do seletor, na frente e atrás do gargalo: o campo delas é em z.
  const coilGeometry = mergeGeometries([
    new THREE.TorusGeometry(0.05, 0.009, 12, 40).translate(selectorMid, BEAM_Y, 0.062),
    new THREE.TorusGeometry(0.05, 0.009, 12, 40).translate(selectorMid, BEAM_Y, -0.062),
  ]);
  if (!coilGeometry) throw new Error('Falha ao montar as bobinas do seletor');
  const selectorCoils = new THREE.Mesh(keep(coilGeometry), materials.brushedBrass);
  selectorCoils.castShadow = true;
  group.add(selectorCoils);

  // Suporte do seletor até o tampo.
  const selectorStandHeight = centerHeight + BEAM_Y - 0.045;
  const standGeometry = new THREE.BoxGeometry(0.03, selectorStandHeight, 0.05).translate(
    selectorMid,
    BEAM_Y - 0.045 - selectorStandHeight / 2,
    0,
  );
  const stand = new THREE.Mesh(keep(standGeometry), materials.anodizedAluminum);
  stand.castShadow = true;
  group.add(stand);

  const selectorAnchor = new THREE.Object3D();
  selectorAnchor.position.set(selectorMid, BEAM_Y + 0.08, 0);
  group.add(selectorAnchor);

  return {
    group,
    selectorAnchor,
    setSelector(on: boolean): void {
      plateMaterial.emissiveIntensity = on ? 0.6 : 0;
    },
    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const material of owned) material.dispose();
      group.clear();
    },
  };
}
