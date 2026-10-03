import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from './materials';
import { PALETTE } from './materials';
import { nameplateTexture } from './textures/procedural';

/**
 * Canhão de elétrons (ADR 0009 e 0010), usado por mais de um experimento:
 * tubo de alumínio escuro com bobinas de latão (as lentes magnéticas que
 * focalizam o feixe), um bocal na frente e o
 * catodo aceso lá atrás. O eixo do feixe é +x; a origem do grupo é a ponta
 * do bocal, de onde os elétrons saem. A placa dourada fica na base.
 */

export interface ElectronGun {
  readonly group: THREE.Group;
  /** Brilho do catodo e do bocal, para o bloom. */
  readonly glowing: THREE.Object3D[];
  /** Liga e desliga o brilho do bocal (feixe visível ou não). */
  setFiring(on: boolean): void;
  /** Cor do brilho do bocal. */
  setTint(hex: number): void;
  dispose(): void;
}

export interface ElectronGunOptions {
  readonly materials: MaterialLibrary;
  /** Altura do eixo acima do carrinho, em unidades de cena. */
  readonly axisHeight: number;
  /** Segunda linha da placa dourada (a primeira é sempre @juliophisico). */
  readonly nameplate?: string;
}

const LENGTH = 0.42;
const RADIUS = 0.065;

export function createElectronGun({
  materials,
  axisHeight,
  nameplate = 'CANHÃO DE ELÉTRONS · 50 kV',
}: ElectronGunOptions): ElectronGun {
  const group = new THREE.Group();
  group.name = 'electron-gun';
  const geometries: THREE.BufferGeometry[] = [];
  const owned: THREE.Material[] = [];
  const glowing: THREE.Object3D[] = [];

  const along = (geometry: THREE.BufferGeometry, x: number): THREE.BufferGeometry =>
    geometry.rotateZ(-Math.PI / 2).translate(x, 0, 0);

  // Corpo: tubo, tampa traseira e bocal cônico, uma malha só.
  const body = mergeGeometries([
    along(new THREE.CylinderGeometry(RADIUS, RADIUS, LENGTH, 48), -0.05 - LENGTH / 2),
    along(new THREE.CylinderGeometry(RADIUS * 1.12, RADIUS * 1.12, 0.03, 48), -0.05 - LENGTH),
    along(new THREE.CylinderGeometry(0.018, RADIUS * 0.8, 0.05, 48), -0.025),
  ]);
  if (!body) throw new Error('Falha ao montar o canhão');
  geometries.push(body);
  const bodyMesh = new THREE.Mesh(body, materials.anodizedAluminum);
  bodyMesh.castShadow = true;
  group.add(bodyMesh);

  // Bobinas de latão em volta do tubo: as lentes magnéticas.
  const coils = mergeGeometries(
    [-0.13, -0.24, -0.35].map((x) =>
      new THREE.TorusGeometry(RADIUS * 1.08, 0.012, 12, 48).rotateY(Math.PI / 2).translate(x, 0, 0),
    ),
  );
  if (!coils) throw new Error('Falha ao montar as bobinas');
  geometries.push(coils);
  const coilMesh = new THREE.Mesh(coils, materials.brushedBrass);
  coilMesh.castShadow = true;
  group.add(coilMesh);

  // Bocal aceso: um disco emissivo na saída do feixe.
  const nozzleMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.focus, toneMapped: false });
  owned.push(nozzleMaterial);
  const nozzleGeometry = new THREE.CircleGeometry(0.012, 24).rotateY(Math.PI / 2);
  geometries.push(nozzleGeometry);
  const nozzle = new THREE.Mesh(nozzleGeometry, nozzleMaterial);
  nozzle.position.x = 0.001;
  group.add(nozzle);
  glowing.push(nozzle);

  // Suporte: coluna e base até o carrinho, com a placa na frente.
  const standHeight = axisHeight - RADIUS;
  const stand = mergeGeometries([
    new THREE.BoxGeometry(0.05, standHeight, 0.05).translate(-0.25, -RADIUS - standHeight / 2, 0),
    // Base alta o bastante para a placa caber inteira na frente dela.
    new THREE.BoxGeometry(0.36, 0.1, 0.2).translate(-0.25, -axisHeight + 0.05, 0),
  ]);
  if (!stand) throw new Error('Falha ao montar o suporte do canhão');
  geometries.push(stand);
  const standMesh = new THREE.Mesh(stand, materials.anodizedAluminum);
  standMesh.castShadow = true;
  standMesh.receiveShadow = true;
  group.add(standMesh);

  const plateTexture = nameplateTexture('@juliophisico', nameplate);
  const plateGeometry = new THREE.PlaneGeometry(0.26, 0.26 * (352 / 1024));
  geometries.push(plateGeometry);
  const plateMaterial = new THREE.MeshStandardMaterial({
    map: plateTexture,
    metalness: 0.75,
    roughness: 0.38,
    envMapIntensity: 0.6,
  });
  owned.push(plateMaterial);
  const plate = new THREE.Mesh(plateGeometry, plateMaterial);
  plate.name = 'nameplate';
  // Na frente da base, voltada para quem está diante da bancada (+z).
  plate.position.set(-0.25, -axisHeight + 0.05, 0.1 + 0.002);
  group.add(plate);

  return {
    group,
    glowing,
    setFiring(on: boolean): void {
      nozzle.visible = on;
    },
    setTint(hex: number): void {
      nozzleMaterial.color.setHex(hex);
    },
    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const material of owned) material.dispose();
      group.clear();
    },
  };
}
