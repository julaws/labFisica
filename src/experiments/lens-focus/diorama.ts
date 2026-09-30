import * as THREE from 'three';
import { mergeGeometries as mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../scene/materials';
import { PALETTE } from '../../scene/materials';
import { skyBackdrop } from '../../scene/textures/procedural';
import {
  DIORAMA_DEPTH,
  distanceToDioramaOffset,
  dioramaOffsetToDistance,
} from '../../scene/scale';
import { DEFAULT_SUBJECT_DISTANCES_MM } from '../../optics/constants';

/**
 * Diorama do experimento 1 (SPEC §6.2 e §12/F4).
 *
 * Um vale em miniatura sobre uma bandeja de madeira: relevo suave, pinheiros
 * instanciados, uma cabana com janelas acesas e uma montanha com neve.
 *
 * A regra que manda em tudo: **cada objeto fica na posição mapeada da sua
 * distância física**. A posição vem de `scene/scale.ts`, que é o único lugar do
 * projeto autorizado a comprimir a profundidade. Nada aqui escolhe uma posição
 * "porque ficou bonito" — escolhe-se a distância em milímetros, e o mapa diz
 * onde isso cai.
 *
 * O eixo óptico é +x, com o objeto do lado −x. Então afastamento no mapa vira
 * posição −x.
 */

export interface DioramaSubject {
  readonly id: 'foreground' | 'midground' | 'background';
  /** Distância física à objetiva, em mm. */
  readonly distanceMm: number;
  /** Objeto da cena, já na posição mapeada. */
  readonly object: THREE.Object3D;
  /** Ponto de onde partem os raios: o alto do objeto, em coordenadas locais. */
  readonly samplePoint: THREE.Vector3;
  /** Cor do objeto nos raios e anéis de CoC (SPEC §6.5). */
  readonly color: number;
  readonly label: Record<'pt-BR' | 'en', string>;
}

export interface Diorama {
  readonly group: THREE.Group;
  /** Os três objetos de referência, em ordem de distância. */
  readonly subjects: readonly DioramaSubject[];
  /** Malhas cujo shader receberá a linha de interseção na F5. */
  readonly terrainMaterials: readonly THREE.Material[];
  readonly glowing: readonly THREE.Object3D[];
  dispose(): void;
}

export interface DioramaOptions {
  readonly materials: MaterialLibrary;
  /** Teto de instâncias de vegetação, vindo da qualidade adaptativa. */
  readonly instanceBudget: number;
  /**
   * Altura do pedestal, em unidades de cena: quanto a bandeja está acima do
   * tampo da bancada. O vale precisa subir até a altura do eixo óptico, senão
   * a imagem dos objetos cai fora do sensor.
   */
  readonly standHeight: number;
}

/** Ponto mais baixo que o relevo alcança, em unidades de cena. */
const TERRAIN_MIN = 0.03;

/** Largura da bandeja (transversal ao eixo óptico), em unidades de cena. */
const TRAY_WIDTH = 0.52;
const TRAY_THICKNESS = 0.022;

/** Gerador determinístico: a cena precisa ser idêntica entre capturas. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/** Converte uma distância física em posição x da cena (objeto fica em −x). */
export function distanceToSceneX(millimeters: number): number {
  return -distanceToDioramaOffset(millimeters);
}

/**
 * Altura do terreno num ponto, em unidades de cena. É uma função suave e
 * determinística, usada tanto pela malha quanto para assentar os objetos.
 */
function terrainHeight(offset: number, lateral: number): number {
  const ridge = Math.sin(offset * 5.1) * 0.012 + Math.cos(offset * 9.7 + 1.3) * 0.006;
  const cross = Math.cos(lateral * 7.3) * 0.009;
  // O terreno sobe de leve no fundo da bandeja, onde fica a montanha. O termo
  // é limitado: sem o teto, a borda distante vira uma parede vertical.
  const far = Math.max(0, offset - DIORAMA_DEPTH.gapScene - DIORAMA_DEPTH.spanScene * 0.55);
  const rise = Math.min(far * far * 0.42, 0.055);
  return ridge + cross + rise;
}

export function createDiorama({
  materials,
  instanceBudget,
  standHeight,
}: DioramaOptions): Diorama {
  const group = new THREE.Group();
  group.name = 'diorama';

  const geometries: THREE.BufferGeometry[] = [];
  const ownedMaterials: THREE.Material[] = [];
  const glowing: THREE.Object3D[] = [];
  const random = createRandom(20260928);

  const nearOffset = DIORAMA_DEPTH.gapScene;
  const farOffset = DIORAMA_DEPTH.gapScene + DIORAMA_DEPTH.spanScene;
  const trayLength = farOffset - nearOffset;
  const centerOffset = (nearOffset + farOffset) / 2;

  // --- Bandeja de madeira ---------------------------------------------------
  const trayGeometry = new THREE.BoxGeometry(trayLength + 0.06, TRAY_THICKNESS, TRAY_WIDTH + 0.06);
  geometries.push(trayGeometry);
  const tray = new THREE.Mesh(trayGeometry, materials.trayWood);
  // O relevo do terreno vai abaixo de zero nos vales; a bandeja desce o
  // suficiente para o terreno nunca afundar nela e virar um recorte.
  tray.position.set(-centerOffset, -TRAY_THICKNESS / 2 - TERRAIN_MIN, 0);
  tray.castShadow = true;
  tray.receiveShadow = true;
  group.add(tray);

  // --- Pedestal -------------------------------------------------------------
  // Coluna e sapata: mesmo material, uma malha só.
  if (standHeight > 0.01) {
    const column = new THREE.CylinderGeometry(0.016, 0.02, standHeight, 14)
      .toNonIndexed()
      .translate(-centerOffset, -TRAY_THICKNESS - TERRAIN_MIN - standHeight / 2, 0);
    const foot = new THREE.BoxGeometry(0.1, 0.018, 0.12)
      .toNonIndexed()
      .translate(-centerOffset, -TRAY_THICKNESS - TERRAIN_MIN - standHeight + 0.009, 0);
    const standGeometry = mergeBufferGeometries([column, foot]);
    column.dispose();
    foot.dispose();
    if (!standGeometry) throw new Error('Falha ao mesclar o pedestal');
    geometries.push(standGeometry);
    const stand = new THREE.Mesh(standGeometry, materials.anodizedAluminum);
    stand.castShadow = true;
    stand.receiveShadow = true;
    group.add(stand);
  }

  // --- Terreno --------------------------------------------------------------
  const segmentsX = 96;
  const segmentsZ = 40;
  const terrainGeometry = new THREE.PlaneGeometry(trayLength, TRAY_WIDTH, segmentsX, segmentsZ);
  terrainGeometry.rotateX(-Math.PI / 2);

  const position = terrainGeometry.attributes.position!;
  for (let i = 0; i < position.count; i += 1) {
    // x local vai de −trayLength/2 a +trayLength/2; converte para afastamento.
    const offset = centerOffset - position.getX(i);
    position.setY(i, terrainHeight(offset, position.getZ(i)));
  }
  terrainGeometry.computeVertexNormals();
  geometries.push(terrainGeometry);

  // Cores de maquete (SPEC §3.1): saturadas porém controladas, puxadas para
  // o verde-musgo vivo da referência, não para o verde escuro de mata.
  const terrainMaterial = new THREE.MeshStandardMaterial({
    color: 0x4f7f38,
    roughness: 0.92,
    metalness: 0,
  });
  ownedMaterials.push(terrainMaterial);

  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.position.set(-centerOffset, 0, 0);
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  group.add(terrain);

  // --- Montanha com neve ----------------------------------------------------
  const peakDistance = DEFAULT_SUBJECT_DISTANCES_MM.background;
  const peakOffset = distanceToDioramaOffset(peakDistance);

  // Rocha e neve numa geometria só, com a cor por vértice: uma malha em vez
  // de duas em cada passe (SPEC §8). A neve fica 6,2 cm acima do centro.
  const rock = paint(new THREE.ConeGeometry(0.105, 0.19, 7, 1), 0x7c8190);
  const cap = paint(new THREE.ConeGeometry(0.041, 0.072, 7, 1), 0xe8eef7).translate(0, 0.062, 0);
  const mountainGeometry = mergeBufferGeometries([rock, cap]);
  rock.dispose();
  cap.dispose();
  if (!mountainGeometry) throw new Error('Falha ao mesclar a montanha');
  geometries.push(mountainGeometry);
  const mountainMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.88,
    flatShading: true,
    vertexColors: true,
  });
  ownedMaterials.push(mountainMaterial);
  const mountain = new THREE.Mesh(mountainGeometry, mountainMaterial);
  mountain.position.set(-peakOffset, terrainHeight(peakOffset, 0) + 0.082, 0.015);
  mountain.castShadow = true;
  mountain.receiveShadow = true;
  group.add(mountain);

  // --- Pinheiros instanciados ----------------------------------------------
  const pineGeometry = createPineGeometry();
  geometries.push(pineGeometry);
  const pineMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.88,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
  });
  ownedMaterials.push(pineMaterial);

  const pineCount = Math.max(18, Math.min(Math.round(instanceBudget / 22), 84));
  const pines = new THREE.InstancedMesh(pineGeometry, pineMaterial, pineCount);
  pines.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pines.castShadow = true;
  pines.receiveShadow = true;

  // As clareiras precisam existir antes do laço das instâncias.
  const clearings = [
    {
      offset: distanceToDioramaOffset(DEFAULT_SUBJECT_DISTANCES_MM.foreground),
      lateral: -0.06,
    },
    { offset: distanceToDioramaOffset(DEFAULT_SUBJECT_DISTANCES_MM.midground), lateral: 0.08 },
  ];

  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const instanceColors = new Float32Array(pineCount * 3);

  for (let i = 0; i < pineCount; i += 1) {
    // Distribui em distância física, não em posição de cena: é o mapa que
    // decide onde cada árvore cai.
    const t = i / (pineCount - 1);
    const distanceMm =
      DIORAMA_DEPTH.minMm * (DIORAMA_DEPTH.maxMm / DIORAMA_DEPTH.minMm) ** (t * 0.92 + random() * 0.08);
    const offset = distanceToDioramaOffset(distanceMm);

    let lateral = (random() - 0.5) * TRAY_WIDTH * 0.88;

    // Abre clareira em volta da cabana e do pinheiro de referência: eles
    // precisam ser vistos, e um deles é o objeto que o plano de foco corta.
    for (const clearing of clearings) {
      if (Math.abs(offset - clearing.offset) < 0.075 && Math.abs(lateral - clearing.lateral) < 0.1) {
        lateral += lateral > clearing.lateral ? 0.14 : -0.14;
      }
    }
    lateral = Math.max(-TRAY_WIDTH * 0.46, Math.min(TRAY_WIDTH * 0.46, lateral));

    // Mais longe, menor: preserva a sensação de maquete sob a compressão.
    const scale = 0.028 + (1 - t) * 0.03 + random() * 0.012;

    matrix.makeRotationY(random() * Math.PI * 2);
    matrix.scale(new THREE.Vector3(scale, scale * (0.85 + random() * 0.4), scale));
    matrix.setPosition(-offset, terrainHeight(offset, lateral), lateral);
    pines.setMatrixAt(i, matrix);

    // Variação em torno de 1: clareia ou escurece a cor base do vértice.
    color.setHSL(0.27 + random() * 0.08, 0.4 + random() * 0.25, 0.5 + random() * 0.22);
    instanceColors[i * 3] = color.r;
    instanceColors[i * 3 + 1] = color.g;
    instanceColors[i * 3 + 2] = color.b;
  }

  pines.instanceColor = new THREE.InstancedBufferAttribute(instanceColors, 3);
  pines.instanceMatrix.needsUpdate = true;
  group.add(pines);

  // --- Pinheiro de primeiro plano (objeto de referência) --------------------
  const pineDistance = DEFAULT_SUBJECT_DISTANCES_MM.foreground;
  const pineOffset = distanceToDioramaOffset(pineDistance);
  const heroPineMaterial = pineMaterial.clone();
  heroPineMaterial.color.setHex(0xc8ffd8);
  ownedMaterials.push(heroPineMaterial);
  const heroPine = new THREE.Mesh(pineGeometry, heroPineMaterial);
  heroPine.scale.setScalar(0.085);
  heroPine.position.set(-pineOffset, terrainHeight(pineOffset, -0.06), -0.06);
  heroPine.castShadow = true;
  heroPine.receiveShadow = true;
  group.add(heroPine);

  // --- Cabana com janelas acesas -------------------------------------------
  const cabinDistance = DEFAULT_SUBJECT_DISTANCES_MM.midground;
  const cabinOffset = distanceToDioramaOffset(cabinDistance);
  const cabin = createCabin(materials, geometries, ownedMaterials, glowing);
  cabin.position.set(-cabinOffset, terrainHeight(cabinOffset, 0.08), 0.08);
  group.add(cabin);

  // --- Grama instanciada ----------------------------------------------------
  const bladeGeometry = new THREE.ConeGeometry(0.0022, 0.012, 3, 1);
  bladeGeometry.translate(0, 0.006, 0);
  geometries.push(bladeGeometry);
  const bladeMaterial = new THREE.MeshStandardMaterial({
    color: 0x6a9a44,
    roughness: 0.95,
    flatShading: true,
  });
  ownedMaterials.push(bladeMaterial);

  const bladeCount = Math.max(120, Math.min(instanceBudget, 1400));
  const grass = new THREE.InstancedMesh(bladeGeometry, bladeMaterial, bladeCount);
  for (let i = 0; i < bladeCount; i += 1) {
    const offset = nearOffset + random() * trayLength;
    const lateral = (random() - 0.5) * TRAY_WIDTH * 0.94;
    matrix.makeRotationY(random() * Math.PI * 2);
    const scale = 0.7 + random() * 0.8;
    matrix.scale(new THREE.Vector3(scale, scale, scale));
    matrix.setPosition(-offset, terrainHeight(offset, lateral), lateral);
    grass.setMatrixAt(i, matrix);
  }
  grass.instanceMatrix.needsUpdate = true;
  grass.receiveShadow = true;
  group.add(grass);

  // --- Céu pintado no fundo da bandeja ---------------------------------------
  // Fecha o vale como o pano de fundo de uma maquete. Fica além da marca de
  // 10 m do mapa, então a câmera virtual o vê como fundo distante e o desfoca
  // pelo círculo de confusão dessa distância, como qualquer outro objeto.
  const skyHeight = 0.36;
  const skyGeometry = new THREE.PlaneGeometry(TRAY_WIDTH + 0.06, skyHeight);
  geometries.push(skyGeometry);
  const skyMaterial = new THREE.MeshBasicMaterial({ map: skyBackdrop(), fog: false });
  ownedMaterials.push(skyMaterial);
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.name = 'sky';
  // O plano nasce olhando para +z; girado, passa a olhar para a objetiva (+x).
  sky.rotation.y = Math.PI / 2;
  sky.position.set(-(farOffset + 0.03), skyHeight / 2 - TRAY_THICKNESS - TERRAIN_MIN, 0);
  group.add(sky);

  const subjects: DioramaSubject[] = [
    {
      id: 'foreground',
      distanceMm: pineDistance,
      samplePoint: new THREE.Vector3(heroPine.position.x, heroPine.position.y + 0.06, heroPine.position.z),
      object: heroPine,
      color: PALETTE.focus,
      label: { 'pt-BR': 'Pinheiro', en: 'Pine' },
    },
    {
      id: 'midground',
      distanceMm: cabinDistance,
      samplePoint: new THREE.Vector3(cabin.position.x, cabin.position.y + 0.028, cabin.position.z),
      object: cabin,
      color: PALETTE.warm,
      label: { 'pt-BR': 'Cabana', en: 'Cabin' },
    },
    {
      id: 'background',
      distanceMm: peakDistance,
      samplePoint: new THREE.Vector3(
        mountain.position.x,
        mountain.position.y + 0.02,
        mountain.position.z,
      ),
      object: mountain,
      color: PALETTE.cool,
      label: { 'pt-BR': 'Pico', en: 'Peak' },
    },
  ];

  return {
    group,
    subjects,
    terrainMaterials: [terrainMaterial, pineMaterial, mountainMaterial],
    glowing,
    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
      geometries.length = 0;
      ownedMaterials.length = 0;
      group.clear();
    },
  };
}

/** Pinheiro low-poly: três coroas cônicas sobre um tronco, com cores por vértice. */
function createPineGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  for (let tier = 0; tier < 3; tier += 1) {
    const radius = 0.34 - tier * 0.09;
    const height = 0.42 - tier * 0.06;
    const cone = new THREE.ConeGeometry(radius, height, 7, 1);
    cone.translate(0, 0.32 + tier * 0.26, 0);
    parts.push(cone);
  }

  const trunk = new THREE.CylinderGeometry(0.035, 0.05, 0.22, 6);
  trunk.translate(0, 0.11, 0);
  parts.push(trunk);

  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();

  // Cor por vértice: tronco marrom, coroas verdes. A variação entre árvores
  // vem do instanceColor, que multiplica isto.
  const count = merged.attributes.position!.count;
  const colors = new Float32Array(count * 3);
  const y = merged.attributes.position!;
  for (let i = 0; i < count; i += 1) {
    const isTrunk = y.getY(i) < 0.23 && Math.hypot(y.getX(i), y.getZ(i)) < 0.06;
    // Cores absolutas: o instanceColor entra como variação em torno de 1.
    colors[i * 3] = isTrunk ? 0.34 : 0.15;
    colors[i * 3 + 1] = isTrunk ? 0.21 : 0.42;
    colors[i * 3 + 2] = isTrunk ? 0.12 : 0.17;
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  return merged;
}

/** Junta geometrias não indexadas com os mesmos atributos. */
function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const result = new THREE.BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];

  for (const part of parts) {
    const nonIndexed = part.index ? part.toNonIndexed() : part;
    const position = nonIndexed.attributes.position!;
    const normal = nonIndexed.attributes.normal!;

    for (let i = 0; i < position.count; i += 1) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
      normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
    }

    if (nonIndexed !== part) nonIndexed.dispose();
  }

  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return result;
}

/**
 * Tira os índices e pinta todos os vértices de uma cor, para a geometria
 * poder ser mesclada com outras de cor diferente sob um só material.
 */
function paint(geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  const color = new THREE.Color(hex);
  const count = flat.attributes.position!.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return flat;
}

/** Cabana com telhado e janelas emissivas quentes. */
function createCabin(
  materials: MaterialLibrary,
  geometries: THREE.BufferGeometry[],
  ownedMaterials: THREE.Material[],
  glowing: THREE.Object3D[],
): THREE.Group {
  const cabin = new THREE.Group();
  cabin.name = 'cabin';

  // Paredes e telhado numa geometria só, com a cor por vértice.
  const walls = paint(new THREE.BoxGeometry(0.06, 0.042, 0.05), 0x8a5a34).translate(0, 0.021, 0);
  const roofCone = paint(new THREE.ConeGeometry(0.052, 0.03, 4, 1), 0x5c3027)
    .rotateY(Math.PI / 4)
    .translate(0, 0.057, 0);
  const houseGeometry = mergeBufferGeometries([walls, roofCone]);
  walls.dispose();
  roofCone.dispose();
  if (!houseGeometry) throw new Error('Falha ao mesclar a cabana');
  geometries.push(houseGeometry);
  const houseMaterial = new THREE.MeshStandardMaterial({ roughness: 0.82, vertexColors: true });
  ownedMaterials.push(houseMaterial);
  const house = new THREE.Mesh(houseGeometry, houseMaterial);
  house.castShadow = true;
  house.receiveShadow = true;
  cabin.add(house);

  // Janelas: emissivas quentes, é o ponto de luz do diorama (SPEC §3.1).
  // As três vidraças são uma geometria só: uma malha no passe principal e
  // uma no bloom, em vez de três.
  const panes = (
    [
      [0.0305, 0.008, Math.PI / 2],
      [0.0305, -0.012, Math.PI / 2],
      [0.008, 0.0255, 0],
    ] as const
  ).map(([x, z, rotation]) =>
    new THREE.PlaneGeometry(0.015, 0.012).rotateY(rotation).translate(x, 0.024, z),
  );
  const windowGeometry = mergeBufferGeometries(panes);
  for (const pane of panes) pane.dispose();
  if (!windowGeometry) throw new Error('Falha ao mesclar as janelas da cabana');
  geometries.push(windowGeometry);
  const windows = new THREE.Mesh(windowGeometry, materials.emissive(PALETTE.warm, 2.4));
  cabin.add(windows);
  glowing.push(windows);

  // Luz quente escapando pela janela, com alcance curto.
  const lamp = new THREE.PointLight(PALETTE.warm, 0.05, 0.28, 2);
  lamp.position.set(0.02, 0.026, 0.01);
  cabin.add(lamp);

  return cabin;
}

/** Distância física representada por uma posição x da cena. Usado na F5 e F6. */
export function sceneXToDistance(x: number): number {
  return dioramaOffsetToDistance(-x);
}
