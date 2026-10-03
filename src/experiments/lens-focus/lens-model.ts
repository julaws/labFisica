import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AIR, indexD } from '../../optics/glass';
import type { Prescription, Surface } from '../../optics/prescription';
import { glassElements, vertexPositions } from '../../optics/prescription';
import type { MaterialLibrary } from '../../scene/materials';
import { PALETTE } from '../../scene/materials';
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

  // Além do diâmetro livre da própria face, o vidro segue plano até a borda
  // do elemento: é o ressalto dos meniscos III e IV no desenho da patente.
  const faceSag = (surface: Surface, r: number): number =>
    surfaceSag(surface.radius, Math.min(r, surface.semiDiameter));

  for (let i = 0; i <= segments; i += 1) {
    const r = (i / segments) * semiDiameter;
    points.push(new THREE.Vector2(r, frontZ + faceSag(front, r)));
  }

  for (let i = segments; i >= 0; i -= 1) {
    const r = (i / segments) * semiDiameter;
    points.push(new THREE.Vector2(r, backZ + faceSag(back, r)));
  }

  return points;
}

export interface LensElementMesh {
  readonly group: THREE.Group;
  readonly glass: THREE.Mesh;
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
  const material = new THREE.MeshPhysicalMaterial({
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
    // Brilho ciano rasante (ver abaixo): é o que desenha o contorno de cada
    // elemento contra o barril escuro, como na referência.
    emissive: new THREE.Color(PALETTE.focus),
    emissiveIntensity: 1.6,
  });

  // O emissivo só vale na borda: um termo de Fresnel (1 − |n·v|)³ zera o
  // brilho de frente e o acende quando a superfície é vista de raspão. Custa
  // três linhas de shader e nenhuma malha a mais.
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float glassRim = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
      totalEmissiveRadiance *= glassRim * glassRim * glassRim;`,
    );
  };
  material.customProgramCacheKey = () => 'glass-rim-v1';

  return material;
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
  // O elemento tem o diâmetro da face mais larga; a outra termina num
  // ressalto plano (ver elementProfile).
  const semiDiameter = Math.max(front.semiDiameter, back.semiDiameter);

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

  // A borda é do próprio vidro: o perfil do torno já fecha o contorno pela
  // lateral do elemento. (Até a ADR 0005 havia uma faixa preta por cima, como
  // nas lentes reais; ela escondia o contorno que o brilho de Fresnel desenha.)

  const group = new THREE.Group();
  group.name = `element-${frontIndex}-${backIndex}`;
  group.add(glass);
  group.position.x = lensMm(centerMm);

  return {
    group,
    glass,
    centerMm,
    geometries: [glassGeometry],
    materials: [glassMaterial],
  };
}

/**
 * Hastes do modo explodido, uma por elemento, ligando cada vidro ao trilho.
 * Uma InstancedMesh só: seis hastes custavam seis draw calls em cada passe
 * (principal, transmissão, normais, sombra) e levavam o modo explodido acima
 * do orçamento da SPEC §8.
 */
export function createElementPosts(count: number): {
  mesh: THREE.InstancedMesh;
  /** Põe a haste `index` sob o elemento em `x`, com `height` de altura. */
  place(index: number, x: number, height: number): void;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
} {
  const geometry = new THREE.CylinderGeometry(lensMm(1.6), lensMm(2.2), 1, 12);
  geometry.translate(0, -0.5, 0);
  const material = new THREE.MeshStandardMaterial({
    color: 0x14171c,
    roughness: 0.5,
    metalness: 0.85,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = 'element-posts';
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.visible = false;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();

  return {
    mesh,
    place(index: number, x: number, height: number): void {
      position.set(x, 0, 0);
      scale.set(1, Math.max(height, 1e-4), 1);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.instanceMatrix.needsUpdate = true;
    },
    geometries: [geometry],
    materials: [material],
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
  readonly shell: THREE.Mesh;
  readonly liner: THREE.Mesh;
  readonly flange: THREE.Mesh;
  /** Posições de repouso ao longo do eixo, em mm de física. */
  readonly restMm: { focusRing: number; flange: number };
  readonly geometries: THREE.BufferGeometry[];
  readonly materials: THREE.Material[];
}

export interface BarrelOptions {
  /** Maior semidiâmetro livre entre os elementos, mm. */
  readonly clearSemiDiameter: number;
  /** Extensão axial do grupo óptico, mm. */
  readonly opticalLengthMm: number;
}

/**
 * Geometria mecânica do barril, em mm de física a partir do primeiro vértice.
 * Não vem da óptica: é a carcaça, desenhada para mostrar a montagem.
 *
 * O barril avança `frontExtensionMm` à frente do primeiro vidro, e é nessa
 * extensão que mora o anel de foco — longe dos elementos, como na objetiva da
 * referência, para que o corte mostre os seis vidros sem nada por cima.
 */
export const BARREL_LAYOUT = {
  /** Quanto o barril passa à frente do primeiro vértice. */
  frontExtensionMm: 26,
  /** Quanto passa atrás do último vértice. */
  rearExtensionMm: 8,
  /** Centro e largura do anel de foco, na extensão dianteira. */
  focusRingCenterMm: -16,
  focusRingWidthMm: 14,
} as const;

/**
 * Perfil de anel com cantos arredondados, para o torno: retângulo de raio
 * `inner` a `outer` e largura `width`, com cada canto trocado por um arco de
 * raio `corner`. Os pontos vão em (raio, eixo).
 */
function roundedProfile(inner: number, outer: number, width: number, corner: number, steps = 6): THREE.Vector2[] {
  const half = width / 2;
  const r = Math.min(corner, (outer - inner) / 2, half);
  const points: THREE.Vector2[] = [];
  const arc = (cx: number, cy: number, from: number): void => {
    for (let i = 0; i <= steps; i += 1) {
      const angle = from + (Math.PI / 2) * (i / steps);
      points.push(new THREE.Vector2(cx + r * Math.cos(angle), cy + r * Math.sin(angle)));
    }
  };
  // Sentido anti-horário no plano (raio, eixo): base, face externa, topo, face interna.
  arc(inner + r, -half + r, Math.PI);
  arc(outer - r, -half + r, -Math.PI / 2);
  arc(outer - r, half - r, 0);
  arc(inner + r, half - r, Math.PI / 2);
  points.push(points[0]!.clone());
  return points;
}

/** Anel torneado com cantos arredondados, no eixo óptico (X), centrado em `x`. */
function roundedRing(inner: number, outer: number, width: number, corner: number, x = 0, segments = 128): THREE.BufferGeometry {
  const geometry = new THREE.LatheGeometry(roundedProfile(inner, outer, width, corner), segments);
  geometry.rotateZ(-Math.PI / 2);
  geometry.translate(x, 0, 0);
  geometry.computeVertexNormals();
  return geometry.toNonIndexed();
}

/**
 * Barril, anéis e flange. No modo montado o barril tem um **corte de 90°**
 * (SPEC §6.4) para que os elementos continuem visíveis por dentro.
 */
export function createBarrel(
  materials: MaterialLibrary,
  { clearSemiDiameter, opticalLengthMm }: BarrelOptions,
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
  const frontZ = -BARREL_LAYOUT.frontExtensionMm;
  const rearZ = opticalLengthMm + BARREL_LAYOUT.rearExtensionMm;
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

  // --- Anel de foco -----------------------------------------------------------
  // Três peças torneadas, todas de cantos arredondados, que giram juntas:
  // o corpo anodizado, a pegada serrilhada em relevo no meio e a coroa
  // dourada na borda da frente (com um filete dourado atrás). Sem escala
  // numerada: o foco se lê nos números da interface.
  const ringWidth = lensMm(BARREL_LAYOUT.focusRingWidthMm);
  const ringInner = outerRadius * 0.995;
  const thick = outerRadius * 0.11;

  // A pegada é o objeto de referência (é ela que se arrasta); as outras peças
  // são filhas e acompanham o giro.
  const gripGeometry = roundedRing(
    ringInner + thick * 0.55,
    ringInner + thick * 1.42,
    ringWidth * 0.6,
    thick * 0.32,
  );
  geometries.push(gripGeometry);
  const focusRingMaterial = materials.knurledRubber.clone();
  focusRingMaterial.normalMap = materials.knurledRubber.normalMap;
  ownedMaterials.push(focusRingMaterial);
  const focusRing = new THREE.Mesh(gripGeometry, focusRingMaterial);
  focusRing.name = 'focus-ring';
  focusRing.position.x = lensMm(BARREL_LAYOUT.focusRingCenterMm);
  focusRing.castShadow = true;
  group.add(focusRing);

  // Corpo anodizado: um pouco mais baixo que a pegada, com a borda da frente
  // num degrau que recebe a coroa.
  const bodyGeometry = roundedRing(ringInner, ringInner + thick, ringWidth, thick * 0.4);
  geometries.push(bodyGeometry);
  const body = new THREE.Mesh(bodyGeometry, materials.anodizedAluminum);
  body.castShadow = true;
  body.receiveShadow = true;
  focusRing.add(body);

  // Coroa dourada: aro polido na borda da frente, com dois sulcos finos, e um
  // filete dourado na borda de trás. Mesmo material: uma malha só.
  const gold = new THREE.MeshStandardMaterial({
    color: 0xd9ad4f,
    metalness: 1,
    roughness: 0.2,
    envMapIntensity: 1.3,
  });
  ownedMaterials.push(gold);
  const crownWidth = ringWidth * 0.16;
  const crownX = -ringWidth / 2 + crownWidth / 2 - ringWidth * 0.02;
  const crownParts = [
    roundedRing(ringInner + thick * 0.2, ringInner + thick * 1.18, crownWidth, thick * 0.3, crownX),
    // Sulcos: dois anéis finos, mais altos, que fazem a coroa parecer frisada.
    roundedRing(ringInner + thick * 1.1, ringInner + thick * 1.26, crownWidth * 0.18, thick * 0.07, crownX - crownWidth * 0.22),
    roundedRing(ringInner + thick * 1.1, ringInner + thick * 1.26, crownWidth * 0.18, thick * 0.07, crownX + crownWidth * 0.22),
    // Filete de trás.
    roundedRing(ringInner + thick * 0.6, ringInner + thick * 1.08, ringWidth * 0.05, thick * 0.12, ringWidth * 0.44),
  ];
  const crownGeometry = mergeGeometries(crownParts);
  for (const part of crownParts) part.dispose();
  if (!crownGeometry) throw new Error('Falha ao montar a coroa do anel de foco');
  geometries.push(crownGeometry);
  const crown = new THREE.Mesh(crownGeometry, gold);
  crown.name = 'focus-crown';
  crown.castShadow = true;
  focusRing.add(crown);

  // Índice: um triângulo dourado no alto do barril, logo atrás do anel, que
  // marca onde o anel está. Preso à casca: na vista explodida, some com ela.
  const indexGeometry = new THREE.ConeGeometry(thick * 0.28, thick * 0.5, 3);
  indexGeometry.rotateZ(Math.PI);
  indexGeometry.translate(lensMm(BARREL_LAYOUT.focusRingCenterMm) + ringWidth / 2 + thick * 0.45, outerRadius + thick * 0.18, 0);
  shell.updateMatrix();
  indexGeometry.applyMatrix4(shell.matrix.clone().invert());
  geometries.push(indexGeometry);
  const index = new THREE.Mesh(indexGeometry, gold);
  index.name = 'focus-index';
  shell.add(index);

  // --- Flange de montagem (baioneta) ------------------------------------------
  // Dourado e torneado em degraus arredondados, com três garras da baioneta.
  const flangeDepth = lensMm(3);
  const flangeParts = [
    roundedRing(outerRadius * 0.6, outerRadius * 0.9, flangeDepth, flangeDepth * 0.25),
    roundedRing(outerRadius * 0.52, outerRadius * 0.7, flangeDepth * 1.6, flangeDepth * 0.2, flangeDepth * 0.25),
    ...[0, 1, 2].map((i) => {
      const lug = new THREE.BoxGeometry(flangeDepth * 0.7, outerRadius * 0.12, outerRadius * 0.32);
      lug.translate(flangeDepth * 0.95, outerRadius * 0.66, 0);
      lug.rotateX((i * 2 * Math.PI) / 3 + Math.PI / 6);
      return lug.toNonIndexed();
    }),
  ];
  const flangeGeometry = mergeGeometries(flangeParts);
  for (const part of flangeParts) part.dispose();
  if (!flangeGeometry) throw new Error('Falha ao montar o flange');
  geometries.push(flangeGeometry);

  const flange = new THREE.Mesh(flangeGeometry, gold);
  flange.position.x = lensMm(rearZ + 1.5);
  flange.castShadow = true;
  group.add(flange);

  return {
    group,
    focusRing,
    shell,
    liner,
    flange,
    restMm: {
      focusRing: BARREL_LAYOUT.focusRingCenterMm,
      flange: rearZ + 1.5,
    },
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
