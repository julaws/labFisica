import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../scene/materials';
import { COIL_RADIUS } from './apparatus';

/**
 * Par de bobinas de Helmholtz (ADR 0010): duas bobinas de raio R, separadas
 * por R, num garfo que gira sobre um prato em torno do eixo vertical da
 * câmara. Sem giro, o eixo das bobinas (e o campo) aponta para a frente da
 * bancada, perpendicular ao feixe.
 *
 * A seta magenta mostra a direção do campo; ela fica acima das bobinas,
 * paralela ao eixo delas, para não cruzar os rastros.
 */

export interface HelmholtzCoils {
  readonly group: THREE.Group;
  readonly glowing: THREE.Object3D[];
  /** Âncora da etiqueta, no alto do garfo. */
  readonly labelAnchor: THREE.Object3D;
  /** Âncora da etiqueta "B", na ponta da seta. */
  readonly arrowTip: THREE.Object3D;
  /** Giro em graus em torno de y. */
  setAngle(degrees: number): void;
  /** Campo de 0 a 1 do máximo: brilho da seta e das bobinas. */
  setStrength(fraction: number): void;
  dispose(): void;
}

export interface HelmholtzOptions {
  readonly materials: MaterialLibrary;
  /** Distância do centro até o tampo, m. */
  readonly centerHeight: number;
}

const WIRE = 0.024;

export function createHelmholtzCoils({ materials, centerHeight }: HelmholtzOptions): HelmholtzCoils {
  const group = new THREE.Group();
  group.name = 'helmholtz';
  const yoke = new THREE.Group();
  group.add(yoke);
  const geometries: THREE.BufferGeometry[] = [];
  const owned: THREE.Material[] = [];
  const glowing: THREE.Object3D[] = [];
  const half = COIL_RADIUS / 2;

  // Enrolamento de cobre: seção retangular, feita por torno.
  const section = [
    new THREE.Vector2(COIL_RADIUS - WIRE, -WIRE * 0.9),
    new THREE.Vector2(COIL_RADIUS + WIRE, -WIRE * 0.9),
    new THREE.Vector2(COIL_RADIUS + WIRE, WIRE * 0.9),
    new THREE.Vector2(COIL_RADIUS - WIRE, WIRE * 0.9),
    new THREE.Vector2(COIL_RADIUS - WIRE, -WIRE * 0.9),
  ];
  const winding = (z: number): THREE.BufferGeometry =>
    new THREE.LatheGeometry(section, 96).rotateX(Math.PI / 2).translate(0, 0, z).toNonIndexed();
  const copper = new THREE.MeshStandardMaterial({
    color: 0xb8673a,
    metalness: 0.85,
    roughness: 0.32,
    emissive: new THREE.Color(0xff6a2a),
    emissiveIntensity: 0,
  });
  owned.push(copper);
  const coilGeometry = mergeGeometries([winding(half), winding(-half)]);
  if (!coilGeometry) throw new Error('Falha ao montar as bobinas');
  coilGeometry.computeVertexNormals();
  geometries.push(coilGeometry);
  const coils = new THREE.Mesh(coilGeometry, copper);
  coils.castShadow = true;
  yoke.add(coils);

  // Garfo: duas colunas sob as bobinas até o prato, que gira com elas.
  const bottom = -(COIL_RADIUS + WIRE);
  const plateTop = -centerHeight + 0.03;
  const postHeight = bottom - plateTop;
  const frameGeometry = mergeGeometries([
    new THREE.BoxGeometry(0.04, postHeight, 0.05).translate(0, plateTop + postHeight / 2, half),
    new THREE.BoxGeometry(0.04, postHeight, 0.05).translate(0, plateTop + postHeight / 2, -half),
    new THREE.CylinderGeometry(0.2, 0.21, 0.03, 48).translate(0, plateTop - 0.015, 0),
  ]);
  if (!frameGeometry) throw new Error('Falha ao montar o garfo das bobinas');
  geometries.push(frameGeometry);
  const frame = new THREE.Mesh(frameGeometry, materials.anodizedAluminum);
  frame.castShadow = true;
  frame.receiveShadow = true;
  yoke.add(frame);

  // Seta do campo acima das bobinas, paralela ao eixo delas: gira junto.
  const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0xff4fd8, transparent: true, toneMapped: false });
  owned.push(arrowMaterial);
  const arrowY = COIL_RADIUS + WIRE + 0.07;
  const shaft = half * 2.4;
  const arrowGeometry = mergeGeometries([
    new THREE.CylinderGeometry(0.006, 0.006, shaft, 12).rotateX(Math.PI / 2).translate(0, arrowY, -0.02),
    new THREE.ConeGeometry(0.022, 0.06, 18).rotateX(Math.PI / 2).translate(0, arrowY, shaft / 2 + 0.01),
  ]);
  if (!arrowGeometry) throw new Error('Falha ao montar a seta do campo');
  geometries.push(arrowGeometry);
  const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
  yoke.add(arrow);
  glowing.push(arrow);
  // Hastes finas ligando a seta ao alto das bobinas.
  const mastGeometry = mergeGeometries([
    new THREE.CylinderGeometry(0.004, 0.004, arrowY - COIL_RADIUS - WIRE, 8).translate(0, (arrowY + COIL_RADIUS + WIRE) / 2, half),
    new THREE.CylinderGeometry(0.004, 0.004, arrowY - COIL_RADIUS - WIRE, 8).translate(0, (arrowY + COIL_RADIUS + WIRE) / 2, -half),
  ]);
  if (!mastGeometry) throw new Error('Falha ao montar as hastes da seta');
  geometries.push(mastGeometry);
  yoke.add(new THREE.Mesh(mastGeometry, materials.anodizedAluminum));

  const labelAnchor = new THREE.Object3D();
  labelAnchor.position.set(0, COIL_RADIUS + 0.14, 0);
  group.add(labelAnchor);
  const arrowTip = new THREE.Object3D();
  arrowTip.position.set(0, arrowY, shaft / 2 + 0.04);
  yoke.add(arrowTip);

  return {
    group,
    glowing,
    labelAnchor,
    arrowTip,
    setAngle(degrees: number): void {
      yoke.rotation.y = (degrees * Math.PI) / 180;
    },
    setStrength(fraction: number): void {
      arrow.visible = fraction > 0.001;
      arrowMaterial.opacity = 0.35 + 0.65 * Math.min(1, fraction);
      copper.emissiveIntensity = 0.12 * Math.min(1, fraction);
    },
    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const material of owned) material.dispose();
      group.clear();
    },
  };
}
