import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HardwareKit, groupGeometries } from '../../scene/hardware';
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

  // Enrolamento de cobre, feito por torno: a face de fora tem as espiras em
  // relevo (meia-onda por volta de fio), como uma bobina enrolada à mão.
  const turns = 9;
  const bump = 0.0026;
  const h = WIRE * 0.9;
  const section: THREE.Vector2[] = [new THREE.Vector2(COIL_RADIUS - WIRE, -h), new THREE.Vector2(COIL_RADIUS + WIRE, -h)];
  for (let i = 0; i <= turns * 6; i += 1) {
    const y = -h + (2 * h * i) / (turns * 6);
    section.push(new THREE.Vector2(COIL_RADIUS + WIRE + bump * Math.abs(Math.sin((Math.PI * i) / 6)), y));
  }
  section.push(new THREE.Vector2(COIL_RADIUS + WIRE, h), new THREE.Vector2(COIL_RADIUS - WIRE, h), new THREE.Vector2(COIL_RADIUS - WIRE, -h));
  const winding = (z: number): THREE.BufferGeometry =>
    new THREE.LatheGeometry(section, 120).rotateX(Math.PI / 2).translate(0, 0, z).toNonIndexed();
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
  geometries.push(coilGeometry);
  const coils = new THREE.Mesh(coilGeometry, copper);
  coils.castShadow = true;
  yoke.add(coils);

  // Carretéis, bornes, garfo e prato giratório: peças do kit, uma malha por
  // acabamento.
  const kit = new HardwareKit();
  // Bordas do carretel: dois aros finos de cada lado (no raio de dentro e no
  // de fora), que emolduram o cobre sem escondê-lo.
  const rim = (r0: number, r1: number, z: number): THREE.BufferGeometry =>
    new THREE.LatheGeometry(
      [new THREE.Vector2(r0, -0.003), new THREE.Vector2(r1, -0.003), new THREE.Vector2(r1, 0.003), new THREE.Vector2(r0, 0.003), new THREE.Vector2(r0, -0.003)],
      120,
    )
      .rotateX(Math.PI / 2)
      .translate(0, 0, z);
  const flange = (z: number): THREE.BufferGeometry[] => [
    rim(COIL_RADIUS - WIRE - 0.005, COIL_RADIUS - WIRE + 0.004, z),
    rim(COIL_RADIUS + WIRE - 0.004, COIL_RADIUS + WIRE + 0.007, z),
  ];
  for (const z of [half, -half]) {
    for (const side of [-1, 1]) for (const part of flange(z + side * (h + 0.003))) kit.add('anodized', part);
    // Bloco de bornes na base do carretel, por fora, com dois bornes de latão.
    const out = Math.sign(z);
    const blockZ = z + out * (h + 0.006 + 0.012);
    kit.add('anodized', new RoundedBoxGeometry(0.07, 0.034, 0.024, 2, 0.006).translate(0, -(COIL_RADIUS + WIRE) + 0.004, blockZ));
    for (const dx of [-0.018, 0.018]) {
      const post = new THREE.CylinderGeometry(0.0045, 0.0045, 0.014, 16).rotateX(Math.PI / 2).translate(dx, -(COIL_RADIUS + WIRE) + 0.006, blockZ + out * 0.018);
      kit.add('brass', post);
      const nut = new THREE.CylinderGeometry(0.007, 0.007, 0.006, 6).rotateX(Math.PI / 2).translate(dx, -(COIL_RADIUS + WIRE) + 0.006, blockZ + out * 0.015);
      kit.add('brass', nut);
    }
  }

  // Garfo: duas colunas arredondadas sob as bobinas até o prato, que gira
  // com elas. O prato tem a borda chanfrada e marcas de 5° em aço.
  const bottom = -(COIL_RADIUS + WIRE);
  const plateTop = -centerHeight + 0.03;
  const postHeight = bottom - plateTop;
  for (const z of [half, -half]) {
    kit.add('anodized', new RoundedBoxGeometry(0.04, postHeight, 0.05, 2, 0.008).translate(0, plateTop + postHeight / 2, z));
  }
  const plateProfile = [
    new THREE.Vector2(0, plateTop - 0.03),
    new THREE.Vector2(0.21, plateTop - 0.03),
    new THREE.Vector2(0.216, plateTop - 0.024),
    new THREE.Vector2(0.216, plateTop - 0.007),
    new THREE.Vector2(0.208, plateTop),
    new THREE.Vector2(0, plateTop),
  ];
  kit.add('anodized', new THREE.LatheGeometry(plateProfile, 72));
  for (let i = 0; i < 72; i += 1) {
    const long = i % 6 === 0;
    const angle = (i * Math.PI) / 36;
    const tick = new THREE.BoxGeometry(long ? 0.02 : 0.011, 0.0012, 0.0016)
      .translate(0.196 - (long ? 0.01 : 0.0055), plateTop + 0.0006, 0)
      .rotateY(angle);
    kit.add('steel', tick);
  }
  const hardware = kit.build(materials, 'helmholtz-hardware');
  geometries.push(...groupGeometries(hardware));
  yoke.add(hardware);

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
