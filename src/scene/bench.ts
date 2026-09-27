import * as THREE from 'three';
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

  // O topo recebe as luzes de teto em cheio; com o mesmo material do corpo
  // ele lava e a bancada deixa de ser "console escuro" (SPEC §3.1).
  const topMaterial = materials.benchBody.clone();
  topMaterial.color.setHex(0x080b11);
  topMaterial.roughness = 0.72;
  topMaterial.clearcoat = 0.1;
  owned.push(topMaterial);

  const top = new THREE.Mesh(topGeometry, topMaterial);
  top.position.y = BENCH.height - BENCH.topThickness / 2;
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

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

    const block = new THREE.Mesh(carriageParts.block, materials.anodizedAluminum);
    block.position.y = 0.026;
    block.castShadow = true;
    block.receiveShadow = true;
    carriageGroup.add(block);

    const post = new THREE.Mesh(carriageParts.post, materials.anodizedAluminum);
    post.position.y = 0.075;
    post.castShadow = true;
    carriageGroup.add(post);

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

  // Perfil extrudado: base larga com dois trilhos de guia.
  const baseGeometry = new THREE.BoxGeometry(RAIL_LENGTH_SCENE, 0.026, 0.13);
  owned.push(baseGeometry);
  const base = new THREE.Mesh(baseGeometry, materials.anodizedAluminum);
  base.position.y = 0.013;
  base.castShadow = true;
  base.receiveShadow = true;
  rail.add(base);

  const guideGeometry = new THREE.BoxGeometry(RAIL_LENGTH_SCENE, 0.016, 0.022);
  owned.push(guideGeometry);
  for (const z of [-0.042, 0.042]) {
    const guide = new THREE.Mesh(guideGeometry, materials.anodizedAluminum);
    guide.position.set(0, 0.034, z);
    guide.castShadow = true;
    rail.add(guide);
  }

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

function createCarriageGeometries(): Record<string, THREE.BufferGeometry> {
  return {
    block: new THREE.BoxGeometry(0.09, 0.052, 0.12),
    post: new THREE.CylinderGeometry(0.009, 0.011, 0.05, 14),
    screw: new THREE.CylinderGeometry(0.008, 0.008, 0.016, 12),
  };
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
