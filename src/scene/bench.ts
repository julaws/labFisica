import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from './materials';
import { PALETTE } from './materials';
import { engravedRuler } from './textures/procedural';
import { mmToScene } from './scale';

/**
 * Bancada óptica (SPEC §3.1): console escuro de cantos chanfrados, faixa de LED
 * embutida, trilho de alumínio anodizado com régua gravada em mm e carrinhos
 * deslizantes com parafusos de latão.
 *
 * O trilho é a **API de montagem** dos experimentos: `mountAt(mm)` devolve um
 * carrinho posicionado na marca da régua, e o experimento pendura nele o que
 * quiser. Assim a lente, o diorama e o plano da imagem ficam em posições que
 * correspondem a números reais (SPEC §7).
 */

export interface Carriage {
  readonly group: THREE.Group;
  /** Posição na régua, em mm. */
  position: number;
  /** Move o carrinho para uma marca da régua. */
  moveTo(mm: number): void;
}

export interface Bench {
  readonly group: THREE.Group;
  /** Altura do topo do trilho, em unidades de cena. */
  readonly railTopY: number;
  /** Comprimento útil do trilho, em mm. */
  readonly railLengthMm: number;
  /** Largura do console, em unidades de cena. */
  readonly width: number;
  /** Altura do tampo (face de cima), em unidades de cena. */
  readonly topY: number;
  /** z da face frontal do corpo, a que a câmera vê. */
  readonly frontZ: number;
  readonly glowing: THREE.Object3D[];
  /** Cria um carrinho na marca indicada e o adiciona ao trilho. */
  mountAt(millimeters: number): Carriage;
  dispose(): void;
}

const BENCH = {
  width: 3.2,
  depth: 1.0,
  height: 0.92,
  topThickness: 0.06,
  chamfer: 0.035,
};

/** Mesa óptica sobre o tampo: espessura e recuo da borda, m. */
const BREADBOARD = { thickness: 0.014, inset: 0.05 };

/** O trilho representa 1200 mm de curso, desenhado em 2,8 unidades de cena. */
const RAIL_LENGTH_MM = 1200;
const RAIL_LENGTH_SCENE = 2.8;
const RAIL_SCENE_PER_MM = RAIL_LENGTH_SCENE / RAIL_LENGTH_MM;

export function createBench(materials: MaterialLibrary): Bench {
  const group = new THREE.Group();
  group.name = 'bench';

  const owned: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
  const glowing: THREE.Object3D[] = [];

  // --- Corpo do console, com cantos chanfrados ------------------------------
  const bodyGeometry = chamferedBox(
    BENCH.width,
    BENCH.height - BENCH.topThickness,
    BENCH.depth,
    BENCH.chamfer,
  );
  owned.push(bodyGeometry);

  const body = new THREE.Mesh(bodyGeometry, materials.benchBody);
  body.position.y = (BENCH.height - BENCH.topThickness) / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const topGeometry = chamferedBox(
    BENCH.width + 0.04,
    BENCH.topThickness,
    BENCH.depth + 0.04,
    BENCH.chamfer,
  );
  owned.push(topGeometry);

  // O tampo fica um pouco abaixo de `height`: a mesa óptica apoiada nele é
  // que chega à altura de trabalho.
  const top = new THREE.Mesh(topGeometry, materials.benchTop);
  top.position.y = BENCH.height - BREADBOARD.thickness - BENCH.topThickness / 2;
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  // --- Mesa óptica (breadboard) ------------------------------------------------
  // Placa de alumínio anodizado com furação roscada em grade, como nas bancadas
  // de óptica de verdade, recuada da borda do tampo. A face de cima é a altura
  // de trabalho (`topY`): tudo o que os experimentos apoiam fica sobre ela.
  const boardWidth = BENCH.width - BREADBOARD.inset * 2;
  const boardDepth = BENCH.depth - BREADBOARD.inset * 2;
  const boardGeometry = new THREE.BoxGeometry(boardWidth, BREADBOARD.thickness, boardDepth);
  // UV em metros de cena (x, −z), para a furação ter o passo certo e ficar
  // alinhada entre as faces.
  const position = boardGeometry.attributes.position!;
  const uv = boardGeometry.attributes.uv!;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, position.getX(i) + boardWidth / 2, -position.getZ(i) + boardDepth / 2);
  owned.push(boardGeometry);
  const side = materials.anodizedAluminum;
  // Faces da caixa: +x, −x, +y (tampo), −y, +z, −z.
  const board = new THREE.Mesh(boardGeometry, [side, side, materials.breadboard, side, side, side]);
  board.position.y = BENCH.height - BREADBOARD.thickness / 2;
  board.receiveShadow = true;
  board.name = 'breadboard';
  group.add(board);

  // --- Faixa de LED embutida na borda frontal -------------------------------
  const ledGeometry = new THREE.BoxGeometry(BENCH.width - 0.14, 0.012, 0.008);
  owned.push(ledGeometry);
  const led = new THREE.Mesh(ledGeometry, materials.emissive(PALETTE.focus, 1.15));
  led.position.set(0, BENCH.height - 0.085, BENCH.depth / 2 + 0.018);
  group.add(led);
  glowing.push(led);

  // --- Trilho óptico --------------------------------------------------------
  const railTopY = BENCH.height + 0.052;
  const rail = createRail(materials, owned);
  rail.position.y = BENCH.height;
  group.add(rail);

  // --- Carrinhos ------------------------------------------------------------
  const carriageParts = createCarriageGeometries();
  owned.push(...Object.values(carriageParts));

  function mountAt(millimeters: number): Carriage {
    const carriageGroup = new THREE.Group();

    // Bloco e poste: mesmo material, uma malha só.
    const block = new THREE.Mesh(carriageParts.body, materials.anodizedAluminum);
    block.castShadow = true;
    block.receiveShadow = true;
    carriageGroup.add(block);

    // Parafuso de fixação em latão, na lateral.
    const screw = new THREE.Mesh(carriageParts.screw, materials.brushedBrass);
    screw.rotation.z = Math.PI / 2;
    screw.position.set(0.048, 0.03, 0);
    carriageGroup.add(screw);

    carriageGroup.position.y = railTopY - BENCH.height;
    rail.add(carriageGroup);

    const carriage: Carriage = {
      group: carriageGroup,
      position: millimeters,
      moveTo(mm: number): void {
        carriage.position = mm;
        carriageGroup.position.x = millimetersToRailX(mm);
      },
    };

    carriage.moveTo(millimeters);
    return carriage;
  }

  return {
    group,
    railTopY,
    railLengthMm: RAIL_LENGTH_MM,
    width: BENCH.width,
    topY: BENCH.height,
    // O chanfro da extrusão avança meio chanfro além da profundidade.
    frontZ: BENCH.depth / 2 + BENCH.chamfer * 0.5,
    glowing,
    mountAt,
    dispose(): void {
      for (const item of owned) item.dispose();
      owned.length = 0;
      group.clear();
    },
  };
}

/** Converte uma marca da régua (mm) na posição x do trilho, com 0 no centro. */
export function millimetersToRailX(millimeters: number): number {
  return (millimeters - RAIL_LENGTH_MM / 2) * RAIL_SCENE_PER_MM;
}

/** Quantas unidades de cena vale 1 mm medido ao longo do trilho. */
export const RAIL_SCENE_PER_MILLIMETER = RAIL_SCENE_PER_MM;

function createRail(
  materials: MaterialLibrary,
  owned: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[],
): THREE.Group {
  const rail = new THREE.Group();
  rail.name = 'optical-rail';

  // Perfil extrudado: base larga com dois trilhos de guia, numa geometria só
  // (mesmo material, uma malha a menos por passe — SPEC §8).
  const profile = [
    new THREE.BoxGeometry(RAIL_LENGTH_SCENE, 0.026, 0.13).translate(0, 0.013, 0),
    new THREE.BoxGeometry(RAIL_LENGTH_SCENE, 0.016, 0.022).translate(0, 0.034, -0.042),
    new THREE.BoxGeometry(RAIL_LENGTH_SCENE, 0.016, 0.022).translate(0, 0.034, 0.042),
  ];
  const profileGeometry = mergeGeometries(profile);
  for (const part of profile) part.dispose();
  if (!profileGeometry) throw new Error('Falha ao mesclar o perfil do trilho');
  owned.push(profileGeometry);
  const base = new THREE.Mesh(profileGeometry, materials.anodizedAluminum);
  base.castShadow = true;
  base.receiveShadow = true;
  rail.add(base);

  // Régua gravada: textura desenhada em canvas, aplicada na face de cima da
  // borda frontal do trilho. As marcas são de 10 em 10 mm, numeradas a cada 50.
  const rulerTexture = engravedRuler({ lengthMm: RAIL_LENGTH_MM, minorStepMm: 20, majorEvery: 5, width: 4096 });
  const rulerMaterial = new THREE.MeshStandardMaterial({
    map: rulerTexture,
    transparent: true,
    roughness: 0.6,
    metalness: 0.1,
    emissiveMap: rulerTexture,
    emissive: new THREE.Color(0x9fb6d8),
    emissiveIntensity: 0.35,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  owned.push(rulerMaterial);

  const rulerGeometry = new THREE.PlaneGeometry(RAIL_LENGTH_SCENE, RAIL_LENGTH_SCENE / 32);
  owned.push(rulerGeometry);
  const ruler = new THREE.Mesh(rulerGeometry, rulerMaterial);
  ruler.rotation.x = -Math.PI / 2;
  ruler.position.set(0, 0.0265, 0.0755);
  rail.add(ruler);

  return rail;
}

function createCarriageGeometries(): { body: THREE.BufferGeometry; screw: THREE.BufferGeometry } {
  const block = new THREE.BoxGeometry(0.09, 0.052, 0.12).translate(0, 0.026, 0);
  // O poste perde os índices para casar com a caixa na mescla.
  const post = new THREE.CylinderGeometry(0.009, 0.011, 0.05, 14).translate(0, 0.075, 0);
  const body = mergeGeometries([block.toNonIndexed(), post.toNonIndexed()]);
  block.dispose();
  post.dispose();
  if (!body) throw new Error('Falha ao mesclar o carrinho');
  return { body, screw: new THREE.CylinderGeometry(0.008, 0.008, 0.016, 12) };
}

/**
 * Caixa com cantos chanfrados (SPEC §3.1). Feita por extrusão de um retângulo
 * de cantos cortados, que é mais barato que arredondar e dá o mesmo brilho de
 * aresta que se vê no console de referência.
 */
function chamferedBox(
  width: number,
  height: number,
  depth: number,
  chamfer: number,
): THREE.ExtrudeGeometry {
  const w = width / 2;
  const h = height / 2;
  const c = Math.min(chamfer, Math.min(w, h) * 0.9);

  const shape = new THREE.Shape();
  shape.moveTo(-w + c, -h);
  shape.lineTo(w - c, -h);
  shape.lineTo(w, -h + c);
  shape.lineTo(w, h - c);
  shape.lineTo(w - c, h);
  shape.lineTo(-w + c, h);
  shape.lineTo(-w, h - c);
  shape.lineTo(-w, -h + c);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: c * 0.5,
    bevelSize: c * 0.5,
    bevelSegments: 2,
  });

  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

/** Converte mm de física em unidades de cena para peças fora do trilho. */
export const benchMmToScene = mmToScene;
