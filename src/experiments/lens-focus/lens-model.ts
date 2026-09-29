import * as THREE from 'three';
import { AIR, indexD } from '../../optics/glass';
import type { Prescription, Surface } from '../../optics/prescription';
import { glassElements, vertexPositions } from '../../optics/prescription';
import type { MaterialLibrary } from '../../scene/materials';
import { LENS_EXAGGERATION, mmToScene } from '../../scene/scale';
import {
  DEFAULT_IRIS,
  type IrisConfig,
  bladeAngleForAperture,
  bladePlacements,
  bladeSweepRadius,
} from './iris';

/**
 * Modelo 3D da objetiva, **gerado a partir da prescrição** (SPEC §6.4).
 *
 * Cada elemento é um sólido de revolução com as duas curvaturas e a espessura
 * corretas, com a borda cilíndrica pintada de preto como numa lente real.
 * A lente desenhada é a lente simulada: se a prescrição mudar, a geometria muda
 * junto, sem número intermediário digitado à mão.
 *
 * A única liberdade é a **ampliação declarada** de `scene/scale.ts`: uma 50 mm
 * de verdade teria 3 cm de diâmetro na bancada e não daria para ver o vidro.
 */

/** Converte milímetros de física em unidades de cena, já com a ampliação. */
export const lensMm = (millimeters: number): number =>
  mmToScene(millimeters * LENS_EXAGGERATION);

/**
 * Sagita de uma superfície esférica no raio `r`:
 * quanto a superfície avança (ou recua) em relação ao vértice.
 *
 *     sag(R, r) = R − sign(R)·√(R² − r²)
 *
 * Positiva para superfície convexa vista pela luz que chega; zero no plano.
 */
export function surfaceSag(radius: number, r: number): number {
  if (!Number.isFinite(radius)) return 0;

  const limit = Math.abs(radius);
  const clamped = Math.min(Math.abs(r), limit);
  return radius - Math.sign(radius) * Math.sqrt(limit * limit - clamped * clamped);
}

/**
 * Perfil (raio, z) de um elemento de vidro, pronto para o `LatheGeometry`.
 * Vai do eixo à borda pela primeira superfície, atravessa a borda e volta ao
 * eixo pela segunda.
 */
export function elementProfile(
  front: Surface,
  back: Surface,
  frontZ: number,
  backZ: number,
  semiDiameter: number,
  segments = 28,
): THREE.Vector2[] {
  const points: THREE.Vector2[] = [];

  for (let i = 0; i <= segments; i += 1) {
    const r = (i / segments) * semiDiameter;
    points.push(new THREE.Vector2(r, frontZ + surfaceSag(front.radius, r)));
  }

  for (let i = segments; i >= 0; i -= 1) {
    const r = (i / segments) * semiDiameter;
    points.push(new THREE.Vector2(r, backZ + surfaceSag(back.radius, r)));
  }

  return points;
}

export interface LensElementMesh {
  readonly group: THREE.Group;
  readonly glass: THREE.Mesh;
  /** Haste que aparece no modo explodido, ligando o elemento ao trilho. */
  readonly post: THREE.Mesh;
  /** Posição do centro do elemento ao longo do eixo, em mm de física. */
  readonly centerMm: number;
  readonly geometries: THREE.BufferGeometry[];
  readonly materials: THREE.Material[];
}

/**
 * Material do vidro (SPEC §6.4): transmissão total, IOR do vidro real em
 * 587 nm, espessura coerente, rugosidade baixíssima, dispersão leve e um traço
 * de iridescência para sugerir o revestimento antirreflexo.
 */
function createGlassMaterial(surface: Surface, thicknessMm: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    transmission: 1,
    ior: indexD(surface.material),
    thickness: lensMm(thicknessMm) * 40,
    roughness: 0.02,
    metalness: 0,
    dispersion: 1.4,
    iridescence: 0.22,
    iridescenceIOR: 1.32,
    iridescenceThicknessRange: [120, 400],
    attenuationColor: new THREE.Color(0xdff3e8),
    attenuationDistance: 0.6,
    clearcoat: 0.25,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.4,
    transparent: true,
    side: THREE.DoubleSide,
  });
}

/** Constrói um elemento de vidro com a borda preta. */
export function createLensElement(
  prescription: Prescription,
  frontIndex: number,
  backIndex: number,
): LensElementMesh {
  const surfaces = prescription.surfaces;
  const vertices = vertexPositions(surfaces);
  const front = surfaces[frontIndex]!;
  const back = surfaces[backIndex]!;
  const frontZ = vertices[frontIndex]!;
  const backZ = vertices[backIndex]!;
  const semiDiameter = Math.min(front.semiDiameter, back.semiDiameter);

  const profileMm = elementProfile(front, back, frontZ, backZ, semiDiameter);
  const centerMm = (frontZ + backZ) / 2;

  // O perfil é gerado em mm de física e só depois convertido para a cena,
  // relativo ao centro do elemento (para o modo explodido poder afastá-lo).
  const profile = profileMm.map(
    (point) => new THREE.Vector2(lensMm(point.x), lensMm(point.y - centerMm)),
  );

  const glassGeometry = new THREE.LatheGeometry(profile, 72);
  const glassMaterial = createGlassMaterial(front, backZ - frontZ);

  const glass = new THREE.Mesh(glassGeometry, glassMaterial);
  // O torno gira em torno de Y; o eixo óptico da bancada é X.
  glass.rotation.z = -Math.PI / 2;

  // Borda pintada de preto, como nas lentes reais: mata o reflexo interno.
  const edgeFront = frontZ + surfaceSag(front.radius, semiDiameter) - centerMm;
  const edgeBack = backZ + surfaceSag(back.radius, semiDiameter) - centerMm;
  const edgeGeometry = new THREE.CylinderGeometry(
    lensMm(semiDiameter) * 1.004,
    lensMm(semiDiameter) * 1.004,
    Math.max(lensMm(Math.abs(edgeBack - edgeFront)), 0.0005),
    72,
    1,
    true,
  );
  const edgeMaterial = new THREE.MeshStandardMaterial({
    color: 0x05070a,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
  edge.rotation.z = -Math.PI / 2;
  edge.position.x = lensMm((edgeFront + edgeBack) / 2);

  // Suporte individual: no modo montado tem altura zero e some.
  const postGeometry = new THREE.CylinderGeometry(lensMm(1.6), lensMm(2.2), 1, 12);
  postGeometry.translate(0, -0.5, 0);
  const postMaterial = new THREE.MeshStandardMaterial({
    color: 0x14171c,
    roughness: 0.5,
    metalness: 0.85,
  });
  const post = new THREE.Mesh(postGeometry, postMaterial);
  post.castShadow = true;
  post.scale.y = 0;
  post.visible = false;

  const group = new THREE.Group();
  group.name = `element-${frontIndex}-${backIndex}`;
  group.add(glass, edge, post);
  group.position.x = lensMm(centerMm);

  return {
    group,
    glass,
    post,
    centerMm,
    geometries: [glassGeometry, edgeGeometry, postGeometry],
    materials: [glassMaterial, edgeMaterial, postMaterial],
  };
}

export interface IrisMesh {
  readonly group: THREE.Group;
  /** Abre ou fecha a íris para o raio livre pedido, em mm de física. */
  setClearRadius(millimeters: number): void;
  readonly geometries: THREE.BufferGeometry[];
  readonly materials: THREE.Material[];
}

/** Diafragma de 9 lâminas, sincronizado com o semidiâmetro do stop. */
export function createIris(config: IrisConfig = DEFAULT_IRIS): IrisMesh {
  const group = new THREE.Group();
  group.name = 'iris';

  const bladeGeometry = new THREE.CylinderGeometry(
    lensMm(config.bladeRadius),
    lensMm(config.bladeRadius),
    lensMm(0.09),
    64,
  );
  bladeGeometry.rotateZ(-Math.PI / 2);

  const bladeMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x0a0c11,
    roughness: 0.38,
    metalness: 0.75,
    clearcoat: 0.3,
    clearcoatRoughness: 0.5,
    side: THREE.DoubleSide,
  });

  // Uma InstancedMesh para as nove lâminas: um draw call em vez de nove, em
  // cada um dos passes (principal, sombra, transmissão). SPEC §8.
  const blades = new THREE.InstancedMesh(bladeGeometry, bladeMaterial, config.bladeCount);
  blades.frustumCulled = false;
  group.add(blades);

  const bladeMatrix = new THREE.Matrix4();

  return {
    group,
    setClearRadius(millimeters: number): void {
      const psi = bladeAngleForAperture(config, millimeters);
      const placements = bladePlacements(config, psi);

      placements.forEach((placement, index) => {
        // Empilhadas com uma folga mínima, como as lâminas reais se sobrepõem.
        const x = lensMm(index * 0.11 - (config.bladeCount * 0.11) / 2);
        const y = lensMm(placement.centerRadius) * Math.cos(placement.centerAngle);
        const z = lensMm(placement.centerRadius) * Math.sin(placement.centerAngle);
        bladeMatrix.makeTranslation(x, y, z);
        blades.setMatrixAt(index, bladeMatrix);
      });
      blades.instanceMatrix.needsUpdate = true;
    },
    geometries: [bladeGeometry],
    materials: [bladeMaterial],
  };
}

export interface BarrelParts {
  readonly group: THREE.Group;
  readonly focusRing: THREE.Mesh;
  readonly apertureRing: THREE.Mesh;
  readonly shell: THREE.Mesh;
  readonly liner: THREE.Mesh;
  readonly flange: THREE.Mesh;
  /** Posições de repouso ao longo do eixo, em mm de física. */
  readonly restMm: { focusRing: number; apertureRing: number; flange: number };
  readonly geometries: THREE.BufferGeometry[];
  readonly materials: THREE.Material[];
}

export interface BarrelOptions {
  /** Semidiâmetro livre dos elementos, mm. */
  readonly clearSemiDiameter: number;
  /** Extensão axial do grupo óptico, mm. */
  readonly opticalLengthMm: number;
  /** Textura da escala gravada no anel de foco. */
  readonly focusScaleTexture: THREE.Texture;
}

/**
 * Barril, anéis e flange. No modo montado o barril tem um **corte de 90°**
 * (SPEC §6.4) para que os elementos continuem visíveis por dentro.
 */
export function createBarrel(
  materials: MaterialLibrary,
  { clearSemiDiameter, opticalLengthMm, focusScaleTexture }: BarrelOptions,
): BarrelParts {
  const group = new THREE.Group();
  group.name = 'barrel';

  const geometries: THREE.BufferGeometry[] = [];
  const ownedMaterials: THREE.Material[] = [];

  // O barril precisa alojar as lâminas recolhidas: é isso que faz uma 50 mm
  // rápida ter 60 mm de diâmetro externo com só 30 mm de vidro.
  const housingMm = Math.max(clearSemiDiameter + 3.2, bladeSweepRadius(DEFAULT_IRIS) + 2);
  const innerRadius = lensMm(clearSemiDiameter + 0.6);
  const outerRadius = lensMm(housingMm);
  const frontZ = -6;
  const rearZ = opticalLengthMm + 10;
  const lengthMm = rearZ - frontZ;

  // Casca com 270°: o quarto que falta é o cutaway.
  const shellGeometry = new THREE.CylinderGeometry(
    outerRadius,
    outerRadius,
    lensMm(lengthMm),
    64,
    1,
    true,
    Math.PI * 0.25,
    Math.PI * 1.5,
  );
  shellGeometry.rotateZ(-Math.PI / 2);
  geometries.push(shellGeometry);

  const shellMaterial = materials.anodizedAluminum.clone();
  shellMaterial.side = THREE.DoubleSide;
  ownedMaterials.push(shellMaterial);

  const shell = new THREE.Mesh(shellGeometry, shellMaterial);
  // O corte nasce voltado para +Z. Uma inclinação negativa em torno do eixo
  // óptico o levanta na direção da câmera padrão, que olha a bancada de cima.
  shell.rotation.x = -Math.PI * 0.18;
  shell.position.x = lensMm(frontZ + lengthMm / 2);
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell);

  // Parede interna preta fosca, que é o que se vê pelo corte.
  const linerGeometry = new THREE.CylinderGeometry(
    innerRadius,
    innerRadius,
    lensMm(lengthMm),
    48,
    1,
    true,
    Math.PI * 0.25,
    Math.PI * 1.5,
  );
  linerGeometry.rotateZ(-Math.PI / 2);
  geometries.push(linerGeometry);

  const linerMaterial = new THREE.MeshStandardMaterial({
    color: 0x04060a,
    roughness: 1,
    metalness: 0,
    side: THREE.BackSide,
  });
  ownedMaterials.push(linerMaterial);

  const liner = new THREE.Mesh(linerGeometry, linerMaterial);
  liner.rotation.x = shell.rotation.x;
  liner.position.x = shell.position.x;
  group.add(liner);

  // Anel de foco: borracha serrilhada com a escala gravada por cima.
  const focusRingGeometry = new THREE.CylinderGeometry(
    outerRadius * 1.1,
    outerRadius * 1.1,
    lensMm(11),
    64,
  );
  focusRingGeometry.rotateZ(-Math.PI / 2);
  geometries.push(focusRingGeometry);

  const focusRingMaterial = materials.knurledRubber.clone();
  focusRingMaterial.normalMap = materials.knurledRubber.normalMap;
  ownedMaterials.push(focusRingMaterial);

  const focusRing = new THREE.Mesh(focusRingGeometry, focusRingMaterial);
  focusRing.name = 'focus-ring';
  focusRing.position.x = lensMm(4);
  focusRing.castShadow = true;
  group.add(focusRing);

  // Faixa gravada, num cilindro um fio maior que o anel.
  const scaleGeometry = new THREE.CylinderGeometry(
    outerRadius * 1.106,
    outerRadius * 1.106,
    lensMm(5.5),
    64,
    1,
    true,
  );
  scaleGeometry.rotateZ(-Math.PI / 2);
  geometries.push(scaleGeometry);

  const scaleMaterial = new THREE.MeshStandardMaterial({
    map: focusScaleTexture,
    emissiveMap: focusScaleTexture,
    emissive: new THREE.Color(0xc9d8ef),
    emissiveIntensity: 0.3,
    transparent: true,
    roughness: 0.5,
    metalness: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  ownedMaterials.push(scaleMaterial);

  const scaleBand = new THREE.Mesh(scaleGeometry, scaleMaterial);
  scaleBand.name = 'focus-scale';
  focusRing.add(scaleBand);
  scaleBand.position.x = lensMm(2.4);

  // Anel de abertura em latão escovado.
  const apertureRingGeometry = new THREE.CylinderGeometry(
    outerRadius * 1.06,
    outerRadius * 1.06,
    lensMm(7),
    64,
  );
  apertureRingGeometry.rotateZ(-Math.PI / 2);
  geometries.push(apertureRingGeometry);

  const apertureRing = new THREE.Mesh(apertureRingGeometry, materials.brushedBrass);
  apertureRing.name = 'aperture-ring';
  apertureRing.position.x = lensMm(opticalLengthMm * 0.55);
  apertureRing.castShadow = true;
  group.add(apertureRing);

  // Flange traseiro de montagem.
  const flangeGeometry = new THREE.CylinderGeometry(
    outerRadius * 0.72,
    outerRadius * 0.72,
    lensMm(3),
    64,
  );
  flangeGeometry.rotateZ(-Math.PI / 2);
  geometries.push(flangeGeometry);

  const flange = new THREE.Mesh(flangeGeometry, materials.anodizedAluminum);
  flange.position.x = lensMm(rearZ - 1.5);
  flange.castShadow = true;
  group.add(flange);

  return {
    group,
    focusRing,
    apertureRing,
    shell,
    liner,
    flange,
    restMm: { focusRing: 4, apertureRing: opticalLengthMm * 0.55, flange: rearZ - 1.5 },
    geometries,
    materials: ownedMaterials,
  };
}

/** Índices das superfícies de cada elemento de vidro da prescrição. */
export function elementIndices(prescription: Prescription): [number, number][] {
  return glassElements(prescription.surfaces)
    .filter((element) => element.material !== AIR)
    .map((element) => [element.surfaceIndices[0]!, element.surfaceIndices[1]!]);
}
