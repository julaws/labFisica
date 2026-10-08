import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HardwareKit, groupGeometries } from '../../scene/hardware';
import type { MaterialLibrary } from '../../scene/materials';
import { BEAM_Y, CHAMBER_RADIUS, INNER_TUBE, NECK_JOIN_X, NECK_RADIUS, NOZZLE_X } from './apparatus';

/**
 * Câmara de vidro e gargalo (ADR 0010), no referencial do centro da câmara
 * (ver `apparatus.ts`). Escala 1:1.
 *
 * O vidro é barato de propósito: material padrão transparente, sem verniz nem
 * transmissão física. A esfera cobre boa parte da tela no close, e um vidro
 * "de verdade" ali custava mais que o resto da cena.
 */

export interface Chamber {
  readonly group: THREE.Group;
  dispose(): void;
}

export interface ChamberOptions {
  readonly materials: MaterialLibrary;
  /** Distância do centro da câmara até o apoio (topo do trilho), m. */
  readonly centerHeight: number;
}

export function createChamber({ materials, centerHeight }: ChamberOptions): Chamber {
  const group = new THREE.Group();
  group.name = 'magnetic-chamber';
  const geometries: THREE.BufferGeometry[] = [];

  const along = (geometry: THREE.BufferGeometry, x0: number, x1: number): THREE.BufferGeometry =>
    geometry.rotateZ(-Math.PI / 2).translate((x0 + x1) / 2, BEAM_Y, 0);

  // --- Vidro: esfera e gargalo, uma malha só ----------------------------------
  const glass = new THREE.MeshStandardMaterial({
    color: 0xd8ecff,
    roughness: 0.06,
    metalness: 0.1,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    envMapIntensity: 1.6,
  });
  const glassGeometry = mergeGeometries([
    new THREE.SphereGeometry(CHAMBER_RADIUS, 48, 32),
    along(new THREE.CylinderGeometry(NECK_RADIUS, NECK_RADIUS, NECK_JOIN_X - NOZZLE_X, 20, 1, true), NOZZLE_X, NECK_JOIN_X),
  ]);
  if (!glassGeometry) throw new Error('Falha ao montar o vidro da câmara');
  geometries.push(glassGeometry);
  const glassMesh = new THREE.Mesh(glassGeometry, glass);
  glassMesh.renderOrder = 2;
  group.add(glassMesh);

  // --- Metal: tubo interno, colar e suporte, uma malha só ----------------------
    const metalGeometry = mergeGeometries([
    // Tubo interno blindado, de onde o feixe sai dentro da câmara.
    along(new THREE.CylinderGeometry(INNER_TUBE.radius, INNER_TUBE.radius, INNER_TUBE.end - NECK_JOIN_X, 16), NECK_JOIN_X, INNER_TUBE.end),
    // Colar na junção do gargalo com a esfera.
    along(new THREE.CylinderGeometry(NECK_RADIUS + 0.008, NECK_RADIUS + 0.008, 0.03, 20), NECK_JOIN_X - 0.03, NECK_JOIN_X),
  ]);
  if (!metalGeometry) throw new Error('Falha ao montar as peças de metal da câmara');
  geometries.push(metalGeometry);
  const metal = new THREE.Mesh(metalGeometry, materials.anodizedAluminum);
  metal.castShadow = true;
  group.add(metal);

  // --- Pedestal torneado da esfera --------------------------------------------
  // Pé anodizado de borda chanfrada, haste de aço e a taça de latão com um
  // anel de borracha onde o vidro assenta.
  {
    const kit = new HardwareKit();
    const floor = -centerHeight;
    kit.add(
      'anodized',
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0, floor),
          new THREE.Vector2(0.074, floor),
          new THREE.Vector2(0.078, floor + 0.004),
          new THREE.Vector2(0.078, floor + 0.012),
          new THREE.Vector2(0.066, floor + 0.02),
          new THREE.Vector2(0.03, floor + 0.026),
          new THREE.Vector2(0.022, floor + 0.04),
          new THREE.Vector2(0, floor + 0.04),
        ],
        48,
      ),
    );
    const stemBottom = floor + 0.038;
    const stemTop = -CHAMBER_RADIUS - 0.012;
    if (stemTop > stemBottom) {
      kit.add('steel', new THREE.CylinderGeometry(0.0115, 0.0115, stemTop - stemBottom, 24).translate(0, (stemTop + stemBottom) / 2, 0));
    }
    kit.add(
      'brass',
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0, stemTop - 0.006),
          new THREE.Vector2(0.018, stemTop - 0.006),
          new THREE.Vector2(0.02, stemTop),
          new THREE.Vector2(0.046, -CHAMBER_RADIUS + 0.012),
          new THREE.Vector2(0.05, -CHAMBER_RADIUS + 0.016),
          new THREE.Vector2(0.044, -CHAMBER_RADIUS + 0.016),
          new THREE.Vector2(0.02, -CHAMBER_RADIUS + 0.002),
          new THREE.Vector2(0, -CHAMBER_RADIUS + 0.002),
        ],
        48,
      ),
    );
    kit.add('rubber', new THREE.TorusGeometry(0.043, 0.0035, 8, 40).rotateX(Math.PI / 2).translate(0, -CHAMBER_RADIUS + 0.014, 0));
    const pedestal = kit.build(materials, 'chamber-pedestal');
    geometries.push(...groupGeometries(pedestal));
    group.add(pedestal);
  }

  return {
    group,
    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      glass.dispose();
      group.clear();
    },
  };
}
