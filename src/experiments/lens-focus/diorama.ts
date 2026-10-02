import * as THREE from 'three';
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
 * onde isso cai. O **tamanho** dos objetos é que é de maquete: eles são
 * desenhados `OBJECT_SCALE` vezes maiores que no começo do projeto (ADR 0006),
 * sem sair do lugar.
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
  /** Malhas cujo shader recebe a linha de interseção do plano de foco. */
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
   * tampo da bancada.
   */
  readonly standHeight: number;
}

/** Ampliação dos objetos do vale sobre o tamanho original (ADR 0006). */
export const OBJECT_SCALE = 3;

/** Ponto mais baixo que o relevo alcança, em unidades de cena. */
const TERRAIN_MIN = 0.03;

/** Largura da bandeja (transversal ao eixo óptico), em unidades de cena. */
export const TRAY_WIDTH = 0.8;
const TRAY_THICKNESS = 0.022;

/** Montanha: altura e raio da base, em unidades de cena. */
export const MOUNTAIN = { height: 0.57, radius: 0.25, lateral: -0.12 } as const;

/** Altura do céu pintado: cobre o pico com folga. */
export const SKY_HEIGHT = 0.9;

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
  const ridge = Math.sin(offset * 7.1) * 0.012 + Math.cos(offset * 13.7 + 1.3) * 0.006;
  const cross = Math.cos(lateral * 5.3) * 0.01 + Math.sin(lateral * 11 + offset * 3) * 0.004;
  // O terreno sobe de leve no fundo da bandeja, atrás da montanha. O termo é
  // limitado: sem o teto, a borda distante vira uma parede vertical.
  const far = Math.max(0, offset - DIORAMA_DEPTH.gapScene - DIORAMA_DEPTH.spanScene * 0.6);
  const rise = Math.min(far * far * 0.6, 0.05);
  return ridge + cross + rise;
}

/** Acumulador de triângulos com cor por vértice, para malhas de facetas. */
class FacetBuilder {
  readonly positions: number[] = [];
  readonly colors: number[] = [];

  triangle(a: THREE.Vector3Like, b: THREE.Vector3Like, c: THREE.Vector3Like, color: THREE.Color): void {
    for (const p of [a, b, c]) {
      this.positions.push(p.x, p.y, p.z);
      this.colors.push(color.r, color.g, color.b);
    }
  }

  quad(a: THREE.Vector3Like, b: THREE.Vector3Like, c: THREE.Vector3Like, d: THREE.Vector3Like, color: THREE.Color): void {
    this.triangle(a, b, c, color);
    this.triangle(a, c, d, color);
  }

  /** Caixa alinhada aos eixos, com cor por face (topo um tom mais claro). */
  box(
    center: THREE.Vector3Like,
    size: THREE.Vector3Like,
    color: THREE.Color,
    rotationY = 0,
  ): void {
    const hx = size.x / 2;
    const hy = size.y / 2;
    const hz = size.z / 2;
    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);
    const v = (x: number, y: number, z: number): THREE.Vector3 =>
      new THREE.Vector3(center.x + x * cos + z * sin, center.y + y, center.z - x * sin + z * cos);
    const p = [
      v(-hx, -hy, -hz), v(hx, -hy, -hz), v(hx, hy, -hz), v(-hx, hy, -hz),
      v(-hx, -hy, hz), v(hx, -hy, hz), v(hx, hy, hz), v(-hx, hy, hz),
    ] as const;
    const top = color.clone().multiplyScalar(1.12);
    const side = color;
    this.quad(p[4], p[5], p[6], p[7], side); // +z
    this.quad(p[1], p[0], p[3], p[2], side); // −z
    this.quad(p[5], p[1], p[2], p[6], side); // +x
    this.quad(p[0], p[4], p[7], p[3], side); // −x
    this.quad(p[7], p[6], p[2], p[3], top); // +y
    this.quad(p[0], p[1], p[5], p[4], side); // −y
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
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
  if (standHeight > 0.01) {
    const standGeometry = new THREE.CylinderGeometry(0.03, 0.036, standHeight, 16);
    standGeometry.translate(-centerOffset, -TRAY_THICKNESS - TERRAIN_MIN - standHeight / 2, 0);
    geometries.push(standGeometry);
    const stand = new THREE.Mesh(standGeometry, materials.anodizedAluminum);
    stand.castShadow = true;
    group.add(stand);
  }

  // --- Terreno --------------------------------------------------------------
  const terrainGeometry = new THREE.PlaneGeometry(trayLength, TRAY_WIDTH, 120, 64);
  terrainGeometry.rotateX(-Math.PI / 2);
  const terrainPosition = terrainGeometry.attributes.position!;
  for (let i = 0; i < terrainPosition.count; i += 1) {
    // x local vai de −trayLength/2 a +trayLength/2; converte para afastamento.
    const offset = centerOffset - terrainPosition.getX(i);
    terrainPosition.setY(i, terrainHeight(offset, terrainPosition.getZ(i)));
  }
  terrainGeometry.computeVertexNormals();
  geometries.push(terrainGeometry);

  // Cores de maquete (SPEC §3.1): saturadas porém controladas.
  const terrainMaterial = new THREE.MeshStandardMaterial({
    color: 0x4f7f38,
    roughness: 0.92,
    metalness: 0,
  });
  ownedMaterials.push(terrainMaterial);

  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.position.set(-centerOffset, 0, 0);
  terrain.receiveShadow = true;
  group.add(terrain);

  // --- Montanha -------------------------------------------------------------
  const peakDistance = DEFAULT_SUBJECT_DISTANCES_MM.background;
  const peakOffset = distanceToDioramaOffset(peakDistance);

  const mountainGeometry = createMountainGeometry(MOUNTAIN.radius, MOUNTAIN.height, 7);
  geometries.push(mountainGeometry);
  const mountainMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.9,
    flatShading: true,
    vertexColors: true,
  });
  ownedMaterials.push(mountainMaterial);
  const mountain = new THREE.Mesh(mountainGeometry, mountainMaterial);
  mountain.name = 'mountain';
  // O pico fica exatamente na marca de 2 m; a base afunda um pouco no relevo.
  mountain.position.set(-peakOffset, terrainHeight(peakOffset, MOUNTAIN.lateral) - 0.02, MOUNTAIN.lateral);
  mountain.castShadow = true;
  mountain.receiveShadow = true;
  group.add(mountain);

  // --- Pinheiros instanciados ----------------------------------------------
  const pineGeometry = createPineGeometry();
  geometries.push(pineGeometry);
  const pineMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.86,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
  });
  ownedMaterials.push(pineMaterial);

  const cabinDistance = DEFAULT_SUBJECT_DISTANCES_MM.midground;
  const cabinOffset = distanceToDioramaOffset(cabinDistance);
  const cabinLateral = 0.1;
  const pineDistance = DEFAULT_SUBJECT_DISTANCES_MM.foreground;
  const pineOffset = distanceToDioramaOffset(pineDistance);
  const heroLateral = -0.15;

  /** Lugares onde não nasce árvore: cabana, pinheiro de referência e a frente. */
  const blocked = (offset: number, lateral: number, size: number): boolean => {
    // Clareira da cabana.
    if (Math.abs(offset - cabinOffset) < 0.13 + size && Math.abs(lateral - cabinLateral) < 0.15 + size) {
      return true;
    }
    // Espaço do pinheiro de referência.
    if (Math.hypot(offset - pineOffset, lateral - heroLateral) < 0.09 + size) return true;
    // Corredor de visão: a frente do vale fica aberta no centro.
    if (offset < cabinOffset - 0.04 && Math.abs(lateral) < 0.1) return true;
    // Dentro da base da montanha.
    if (Math.hypot(offset - peakOffset, lateral - MOUNTAIN.lateral) < MOUNTAIN.radius * 0.85) return true;
    return false;
  };

  const pineCount = Math.max(24, Math.min(Math.round(instanceBudget / 30), 90));
  const pines = new THREE.InstancedMesh(pineGeometry, pineMaterial, pineCount);
  pines.castShadow = true;
  pines.receiveShadow = true;

  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const instanceColors = new Float32Array(pineCount * 3);
  let placed = 0;

  for (let attempt = 0; placed < pineCount && attempt < pineCount * 40; attempt += 1) {
    // Distribui em distância física, não em posição de cena: é o mapa que
    // decide onde cada árvore cai. Mais árvores do meio para o fundo, em
    // volta da montanha.
    const u = random();
    const t = 0.15 + 0.85 * Math.sqrt(u);
    const distanceMm = DIORAMA_DEPTH.minMm * (DIORAMA_DEPTH.maxMm / DIORAMA_DEPTH.minMm) ** t;
    const offset = distanceToDioramaOffset(distanceMm);
    const lateral = (random() - 0.5) * TRAY_WIDTH * 0.92;

    // Mais longe, menor: preserva a sensação de maquete sob a compressão.
    const depthFraction = (offset - nearOffset) / trayLength;
    const scale = OBJECT_SCALE * (0.03 + (1 - depthFraction) * 0.022 + random() * 0.014);
    if (blocked(offset, lateral, scale * 0.3)) continue;

    matrix.makeRotationY(random() * Math.PI * 2);
    matrix.scale(new THREE.Vector3(scale, scale * (0.9 + random() * 0.35), scale));
    matrix.setPosition(-offset, terrainHeight(offset, lateral) - 0.004, lateral);
    pines.setMatrixAt(placed, matrix);

    // Variação em torno de 1: clareia, escurece ou amarela um pouco.
    color.setHSL(0.08 + random() * 0.06, 0.25 + random() * 0.25, 0.82 + random() * 0.3);
    instanceColors[placed * 3] = color.r;
    instanceColors[placed * 3 + 1] = color.g;
    instanceColors[placed * 3 + 2] = color.b;
    placed += 1;
  }
  pines.count = placed;
  pines.instanceColor = new THREE.InstancedBufferAttribute(instanceColors, 3);
  pines.instanceMatrix.needsUpdate = true;
  group.add(pines);

  // --- Pinheiro de primeiro plano (objeto de referência) --------------------
  const heroPineMaterial = pineMaterial.clone();
  heroPineMaterial.color.setHex(0xd8ffe2);
  ownedMaterials.push(heroPineMaterial);
  const heroPine = new THREE.Mesh(pineGeometry, heroPineMaterial);
  heroPine.name = 'hero-pine';
  const heroScale = 0.085 * OBJECT_SCALE;
  heroPine.scale.setScalar(heroScale);
  heroPine.position.set(-pineOffset, terrainHeight(pineOffset, heroLateral) - 0.004, heroLateral);
  heroPine.castShadow = true;
  heroPine.receiveShadow = true;
  group.add(heroPine);

  // --- Cabana com janelas acesas -------------------------------------------
  const cabin = createCabin(materials, geometries, ownedMaterials, glowing);
  cabin.position.set(-cabinOffset, terrainHeight(cabinOffset, cabinLateral), cabinLateral);
  // De frente para a objetiva, levemente girada para mostrar a lateral.
  cabin.rotation.y = 0.35;
  group.add(cabin);

  // --- Pedras espalhadas ----------------------------------------------------
  const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
  geometries.push(rockGeometry);
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0x7b7a78,
    roughness: 0.95,
    flatShading: true,
  });
  ownedMaterials.push(rockMaterial);
  const rockCount = 34;
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockCount);
  let rocksPlaced = 0;
  for (let attempt = 0; rocksPlaced < rockCount && attempt < 400; attempt += 1) {
    const offset = nearOffset + 0.03 + random() * (trayLength - 0.06);
    const lateral = (random() - 0.5) * TRAY_WIDTH * 0.9;
    const size = 0.008 + random() * 0.018;
    if (blocked(offset, lateral, 0) && Math.abs(lateral) < 0.1) continue;
    matrix.makeRotationFromEuler(new THREE.Euler(random() * 3, random() * 3, random() * 3));
    matrix.scale(new THREE.Vector3(size * 1.4, size * 0.7, size));
    matrix.setPosition(-offset, terrainHeight(offset, lateral) + size * 0.2, lateral);
    rocks.setMatrixAt(rocksPlaced, matrix);
    rocksPlaced += 1;
  }
  rocks.count = rocksPlaced;
  rocks.instanceMatrix.needsUpdate = true;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  group.add(rocks);

  // --- Grama instanciada ----------------------------------------------------
  const bladeGeometry = new THREE.ConeGeometry(0.0035, 0.022, 3, 1);
  bladeGeometry.translate(0, 0.011, 0);
  geometries.push(bladeGeometry);
  const bladeMaterial = new THREE.MeshStandardMaterial({
    color: 0x6a9a44,
    roughness: 0.95,
    flatShading: true,
  });
  ownedMaterials.push(bladeMaterial);

  const bladeCount = Math.max(160, Math.min(instanceBudget, 1800));
  const grass = new THREE.InstancedMesh(bladeGeometry, bladeMaterial, bladeCount);
  for (let i = 0; i < bladeCount; i += 1) {
    const offset = nearOffset + random() * trayLength;
    const lateral = (random() - 0.5) * TRAY_WIDTH * 0.96;
    matrix.makeRotationY(random() * Math.PI * 2);
    const scale = 0.7 + random() * 0.9;
    matrix.scale(new THREE.Vector3(scale, scale, scale));
    matrix.setPosition(-offset, terrainHeight(offset, lateral), lateral);
    grass.setMatrixAt(i, matrix);
  }
  grass.instanceMatrix.needsUpdate = true;
  grass.receiveShadow = true;
  group.add(grass);

  // --- Céu pintado logo atrás da montanha ----------------------------------
  // Fecha o vale como o pano de fundo de uma maquete. Fica além da marca de
  // 10 m do mapa, então a câmera virtual o vê como fundo distante e o desfoca
  // pelo círculo de confusão dessa distância, como qualquer outro objeto. É
  // mais largo que a bandeja para encher o quadro do sensor.
  const skyGeometry = new THREE.PlaneGeometry(TRAY_WIDTH + 0.6, SKY_HEIGHT);
  geometries.push(skyGeometry);
  const skyMaterial = new THREE.MeshBasicMaterial({ map: skyBackdrop(), fog: false });
  ownedMaterials.push(skyMaterial);
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.name = 'sky';
  // O plano nasce olhando para +z; girado, passa a olhar para a objetiva (+x).
  sky.rotation.y = Math.PI / 2;
  sky.position.set(-(farOffset + 0.02), SKY_HEIGHT / 2 - TRAY_THICKNESS - TERRAIN_MIN, 0);
  group.add(sky);

  const subjects: DioramaSubject[] = [
    {
      id: 'foreground',
      distanceMm: pineDistance,
      // O alto do pinheiro: a copa vai até ~1,0 na geometria normalizada.
      samplePoint: new THREE.Vector3(
        heroPine.position.x,
        heroPine.position.y + heroScale * 0.92,
        heroPine.position.z,
      ),
      object: heroPine,
      color: PALETTE.focus,
      label: { 'pt-BR': 'Pinheiro', en: 'Pine' },
    },
    {
      id: 'midground',
      distanceMm: cabinDistance,
      samplePoint: new THREE.Vector3(cabin.position.x, cabin.position.y + 0.1, cabin.position.z),
      object: cabin,
      color: PALETTE.warm,
      label: { 'pt-BR': 'Cabana', en: 'Cabin' },
    },
    {
      id: 'background',
      distanceMm: peakDistance,
      samplePoint: new THREE.Vector3(
        mountain.position.x,
        mountain.position.y + MOUNTAIN.height * 0.94,
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
    terrainMaterials: [terrainMaterial, pineMaterial, heroPineMaterial, mountainMaterial, cabinWallsMaterial(cabin)],
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

/**
 * Montanha de facetas: um cone deformado por cristas, com dois picos
 * secundários, rocha em tons variados, uma linha de neve irregular e uma
 * barra de grama na base. Origem na base, pico em `height`.
 */
function createMountainGeometry(radius: number, height: number, seed: number): THREE.BufferGeometry {
  const random = createRandom(seed * 7919);
  const rings = 16;
  const sectors = 40;
  const phases = [random() * 6, random() * 6, random() * 6];

  const ridge = (theta: number): number =>
    0.16 * Math.sin(5 * theta + phases[0]!) +
    0.09 * Math.sin(9 * theta + phases[1]!) +
    0.05 * Math.sin(17 * theta + phases[2]!);

  // Picos secundários: ombros da montanha, em dois ângulos.
  const shoulders = [
    { theta: 2.2, r: 0.5, h: 0.22 },
    { theta: 4.4, r: 0.58, h: 0.16 },
  ];
  const angleGap = (a: number, b: number): number => {
    const d = Math.abs(a - b) % (Math.PI * 2);
    return Math.min(d, Math.PI * 2 - d);
  };

  const point = (ring: number, sector: number): THREE.Vector3 => {
    const fraction = ring / rings; // 0 no pico, 1 na base
    const theta = (sector / sectors) * Math.PI * 2;
    const middle = fraction * (1 - fraction) * 4; // zero no pico e na base
    const r = radius * fraction * (1 + 0.18 * ridge(theta) * middle);
    let y = height * (1 - fraction) ** 1.35 * (1 + 0.22 * ridge(theta) * middle);
    for (const shoulder of shoulders) {
      y +=
        height *
        shoulder.h *
        Math.exp(-(angleGap(theta, shoulder.theta) ** 2) / 0.12 - (fraction - shoulder.r) ** 2 / 0.025);
    }
    if (ring === 0) return new THREE.Vector3(0, height, 0);
    return new THREE.Vector3(Math.cos(theta) * r, Math.max(y, 0), Math.sin(theta) * r);
  };

  const snow = new THREE.Color(0xf1f5fb);
  const snowShade = new THREE.Color(0xd4dfee);
  const rockLight = new THREE.Color(0x908c88);
  const rockDark = new THREE.Color(0x5e5652);
  const grass = new THREE.Color(0x5b7a3c);
  const faceColor = new THREE.Color();

  const builder = new FacetBuilder();
  for (let ring = 0; ring < rings; ring += 1) {
    for (let sector = 0; sector < sectors; sector += 1) {
      const a = point(ring, sector);
      const b = point(ring, sector + 1);
      const c = point(ring + 1, sector + 1);
      const d = point(ring + 1, sector);
      const centerY = (a.y + b.y + c.y + d.y) / 4;
      const theta = ((sector + 0.5) / sectors) * Math.PI * 2;
      const snowLine = height * (0.6 + 0.07 * Math.sin(3 * theta + 1.1) + 0.04 * Math.sin(7 * theta));
      const shade = 0.5 + 0.5 * Math.sin(theta * 2 + 0.6);
      if (centerY > snowLine) {
        faceColor.copy(snow).lerp(snowShade, shade * 0.6);
      } else if (centerY < height * 0.07) {
        faceColor.copy(grass).lerp(rockDark, random() * 0.3);
      } else {
        faceColor.copy(rockDark).lerp(rockLight, (centerY / height) * 0.9 + random() * 0.25);
      }
      if (ring === 0) builder.triangle(a, c, d, faceColor);
      else builder.quad(a, d, c, b, faceColor);
    }
  }
  return builder.build();
}

/**
 * Pinheiro de facetas, normalizado para ~1,0 de altura: tronco e cinco
 * camadas de galhos com borda recortada, mais escuras embaixo e por dentro.
 * A variação entre árvores vem do `instanceColor`, que multiplica isto.
 */
function createPineGeometry(): THREE.BufferGeometry {
  const builder = new FacetBuilder();

  // Tronco: prisma de seis faces.
  const bark = new THREE.Color(0x5a3a22);
  const trunkSides = 6;
  for (let i = 0; i < trunkSides; i += 1) {
    const a0 = (i / trunkSides) * Math.PI * 2;
    const a1 = ((i + 1) / trunkSides) * Math.PI * 2;
    const r0 = 0.045;
    const r1 = 0.03;
    builder.quad(
      { x: Math.cos(a0) * r0, y: 0, z: Math.sin(a0) * r0 },
      { x: Math.cos(a1) * r0, y: 0, z: Math.sin(a1) * r0 },
      { x: Math.cos(a1) * r1, y: 0.24, z: Math.sin(a1) * r1 },
      { x: Math.cos(a0) * r1, y: 0.24, z: Math.sin(a0) * r1 },
      bark,
    );
  }

  const dark = new THREE.Color(0x163d22);
  const mid = new THREE.Color(0x2c6a33);
  const light = new THREE.Color(0x4f9a45);
  const tiers = 5;
  const points = 11;
  const color = new THREE.Color();

  for (let tier = 0; tier < tiers; tier += 1) {
    const baseY = 0.16 + tier * 0.15;
    const topY = baseY + 0.3 - tier * 0.012;
    const radius = 0.36 - tier * 0.062;
    const apex = { x: 0, y: topY, z: 0 };
    const inner = { x: 0, y: baseY + 0.06, z: 0 };

    const rim = (i: number): THREE.Vector3 => {
      const angle = (i / points) * Math.PI * 2 + tier * 0.4;
      // Pontas alternadas: galho comprido e caído, galho curto e erguido.
      const tip = i % 2 === 0;
      const r = radius * (tip ? 1 : 0.74);
      const y = baseY + (tip ? -0.02 : 0.02);
      return new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);
    };

    for (let i = 0; i < points; i += 1) {
      const a = rim(i);
      const b = rim(i + 1);
      // Lado de fora: mais claro no alto da camada.
      color.copy(mid).lerp(light, 0.35 + 0.4 * (tier / tiers));
      builder.triangle(a, apex, b, color);
      // Por baixo: sombra, para a árvore não parecer oca.
      color.copy(dark);
      builder.triangle(a, b, inner, color);
    }
  }

  return builder.build();
}

/** Material das paredes da cabana, guardado para a linha de interseção. */
function cabinWallsMaterial(cabin: THREE.Object3D): THREE.Material {
  const walls = cabin.getObjectByName('cabin-walls') as THREE.Mesh | undefined;
  if (!walls) throw new Error('Cabana sem paredes');
  return walls.material as THREE.Material;
}

/**
 * Cabana de toras: fundação de pedra, paredes em toras alternadas, cantos
 * reforçados, telhado de duas águas com beiral, chaminé, porta, degrau e
 * janelas acesas. Tudo o que não brilha é uma malha só, com cor por vértice.
 * A fachada (empena) olha para +x, para a objetiva.
 */
function createCabin(
  materials: MaterialLibrary,
  geometries: THREE.BufferGeometry[],
  ownedMaterials: THREE.Material[],
  glowing: THREE.Object3D[],
): THREE.Group {
  const cabin = new THREE.Group();
  cabin.name = 'cabin';

  const W = 0.18; // ao longo de x (fachada a fachada)
  const D = 0.15; // ao longo de z
  const H = 0.12; // altura das paredes
  const base = 0.018;

  const builder = new FacetBuilder();
  const stone = new THREE.Color(0x77736e);
  const logA = new THREE.Color(0x8d5b34);
  const logB = new THREE.Color(0x744827);
  const corner = new THREE.Color(0x5c3920);
  const roof = new THREE.Color(0x5b2c24);
  const ridgeColor = new THREE.Color(0x3d1d18);
  const door = new THREE.Color(0x3a2314);
  const trim = new THREE.Color(0xd9c7a6);

  // Fundação.
  builder.box({ x: 0, y: base / 2, z: 0 }, { x: W + 0.016, y: base, z: D + 0.016 }, stone);

  // Paredes de toras: faixas alternadas, cada uma um fio para fora.
  const logs = 7;
  const logHeight = H / logs;
  for (let i = 0; i < logs; i += 1) {
    const inset = i % 2 === 0 ? 0 : 0.003;
    builder.box(
      { x: 0, y: base + logHeight * (i + 0.5), z: 0 },
      { x: W - inset, y: logHeight * 0.96, z: D - inset },
      i % 2 === 0 ? logA : logB,
    );
  }

  // Cantos reforçados.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      builder.box(
        { x: (sx * W) / 2, y: base + H / 2, z: (sz * D) / 2 },
        { x: 0.014, y: H, z: 0.014 },
        corner,
      );
    }
  }

  // Empenas: triângulos de toras nas duas fachadas (cumeeira ao longo de z).
  const pitch = 0.075;
  for (const sx of [-1, 1]) {
    const x = (sx * W) / 2;
    builder.triangle(
      { x, y: base + H, z: -D / 2 },
      { x, y: base + H + pitch, z: 0 },
      { x, y: base + H, z: D / 2 },
      logB,
    );
    builder.triangle(
      { x, y: base + H, z: D / 2 },
      { x, y: base + H + pitch, z: 0 },
      { x, y: base + H, z: -D / 2 },
      logB,
    );
  }

  // Telhado de duas águas, com beiral nas quatro bordas.
  const overhang = 0.022;
  const halfSpan = D / 2 + overhang;
  const slope = Math.atan2(pitch, D / 2);
  const slabLength = halfSpan / Math.cos(slope);
  for (const sz of [-1, 1]) {
    const slab = new FacetBuilder();
    slab.box({ x: 0, y: 0, z: 0 }, { x: W + overhang * 2, y: 0.012, z: slabLength }, roof);
    const geometry = slab.build();
    geometry.rotateX(sz * slope);
    geometry.translate(0, base + H + pitch / 2 + 0.004, (sz * halfSpan) / 2 - sz * 0.002);
    const pos = geometry.attributes.position!;
    const col = geometry.attributes.color!;
    for (let i = 0; i < pos.count; i += 1) {
      builder.positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      builder.colors.push(col.getX(i), col.getY(i), col.getZ(i));
    }
    geometry.dispose();
  }
  // Cumeeira.
  builder.box({ x: 0, y: base + H + pitch + 0.008, z: 0 }, { x: W + overhang * 2, y: 0.01, z: 0.016 }, ridgeColor);

  // Chaminé de pedra.
  builder.box({ x: -0.04, y: base + H + pitch + 0.02, z: -0.035 }, { x: 0.026, y: 0.09, z: 0.026 }, stone);
  builder.box({ x: -0.04, y: base + H + pitch + 0.067, z: -0.035 }, { x: 0.032, y: 0.008, z: 0.032 }, corner);

  // Porta, batentes e degrau, na fachada +x.
  const front = W / 2 + 0.002;
  builder.box({ x: front, y: base + 0.04, z: 0.035 }, { x: 0.006, y: 0.08, z: 0.042 }, door);
  builder.box({ x: front + 0.002, y: base + 0.083, z: 0.035 }, { x: 0.006, y: 0.006, z: 0.05 }, trim);
  builder.box({ x: front + 0.018, y: 0.006, z: 0.035 }, { x: 0.03, y: 0.012, z: 0.06 }, stone);

  // Molduras das janelas.
  const windowSpots = [
    { x: front, y: base + 0.065, z: -0.035, rotation: 0, w: 0.04, h: 0.034 },
    { x: 0.035, y: base + 0.065, z: D / 2 + 0.002, rotation: Math.PI / 2, w: 0.036, h: 0.03 },
    { x: -0.04, y: base + 0.065, z: D / 2 + 0.002, rotation: Math.PI / 2, w: 0.036, h: 0.03 },
    { x: 0, y: base + H + 0.028, z: 0, rotation: 0, w: 0.028, h: 0.026 },
  ];
  for (const spot of windowSpots.slice(0, 3)) {
    builder.box(
      { x: spot.x, y: spot.y, z: spot.z },
      { x: 0.005, y: spot.h + 0.01, z: spot.w + 0.01 },
      trim,
      spot.rotation,
    );
  }

  const wallsGeometry = builder.build();
  geometries.push(wallsGeometry);
  const wallsMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.84,
    vertexColors: true,
    flatShading: true,
  });
  ownedMaterials.push(wallsMaterial);
  const walls = new THREE.Mesh(wallsGeometry, wallsMaterial);
  walls.name = 'cabin-walls';
  walls.castShadow = true;
  walls.receiveShadow = true;
  cabin.add(walls);

  // Janelas acesas: uma geometria só, um fio à frente das molduras. A da
  // empena (sótão) também brilha.
  const panes: THREE.BufferGeometry[] = [];
  for (const spot of windowSpots) {
    const isGable = spot === windowSpots[3];
    const pane = new THREE.PlaneGeometry(spot.w, spot.h);
    if (spot.rotation === 0) {
      pane.rotateY(Math.PI / 2);
      pane.translate(isGable ? W / 2 + 0.004 : spot.x + 0.004, spot.y, spot.z);
    } else {
      pane.translate(spot.x, spot.y, spot.z + 0.004);
    }
    panes.push(pane.toNonIndexed());
    pane.dispose();
  }
  const windowGeometry = mergeFacets(panes);
  for (const pane of panes) pane.dispose();
  geometries.push(windowGeometry);
  const windows = new THREE.Mesh(windowGeometry, materials.emissive(PALETTE.warm, 2.4));
  cabin.add(windows);
  glowing.push(windows);

  // Luz quente escapando pela janela, com alcance curto.
  const lamp = new THREE.PointLight(PALETTE.warm, 0.12, 0.6, 2);
  lamp.position.set(W / 2 + 0.04, base + 0.06, 0);
  cabin.add(lamp);

  return cabin;
}

/** Junta geometrias não indexadas que só têm posição e normal. */
function mergeFacets(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const part of parts) {
    const p = part.attributes.position!;
    for (let i = 0; i < p.count; i += 1) positions.push(p.getX(i), p.getY(i), p.getZ(i));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Distância física representada por uma posição x da cena. Usado na F5 e F6. */
export function sceneXToDistance(x: number): number {
  return dioramaOffsetToDistance(-x);
}
