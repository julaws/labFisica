import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from './materials';
import { PALETTE } from './materials';
import { type PortraitWall, createPortraitWall } from './portrait-wall';
import { createShelfDecor } from './shelf-decor';
import { atomArtwork, galaxyArtwork, wallPosterTexture } from './textures/procedural';

/**
 * A sala do laboratório (SPEC §3.1): estúdio escuro com profundidade, piso de
 * concreto polido, prateleiras ao fundo com enfeites de física, três cartazes
 * retroiluminados e, dos dois lados da estante, a galeria de retratos.
 *
 * A sala é compartilhada entre experimentos: trocar de experimento não a
 * recria (SPEC §7).
 */

RectAreaLightUniformsLib.init();

export interface LabRoom {
  readonly group: THREE.Group;
  /** Luz principal com sombra; o experimento pode mirá-la. */
  readonly keyLight: THREE.DirectionalLight;
  /** Objetos que devem receber bloom (cartazes, faixas de LED). */
  readonly glowing: THREE.Object3D[];
  /** A galeria de retratos da parede do fundo (clicável). */
  readonly portraits: PortraitWall;
  applyShadowQuality(enabled: boolean, mapSize: number): void;
  /**
   * Leva a luz principal para a bancada ativa (ADR 0008). A sombra tem um
   * mapa de resolução fixa; cobrir a sala inteira o deixaria borrado.
   */
  focusOn(x: number): void;
  /**
   * Empresta uma luz pontual da sala (a lâmpada de uma maquete, por exemplo).
   * As luzes ficam sempre na cena, apagadas quando livres: pôr ou tirar uma
   * luz muda o número de luzes e obriga o three a recompilar todos os
   * materiais, o que travava a troca de bancada por segundos (ADR 0008).
   * Devolve null se todas estiverem emprestadas.
   */
  borrowPointLight(): THREE.PointLight | null;
  /** Devolve a luz emprestada, que volta a ficar apagada. */
  returnPointLight(light: THREE.PointLight): void;
  dispose(): void;
}

/** Posição x das bancadas (estações) na sala, da esquerda para a direita. */
export const STATION_X: readonly number[] = [-6.3, -2.1, 2.1, 6.3];

// Larga o bastante para quatro bancadas lado a lado (ADR 0008 e 0011). A
// parede do fundo fica logo atrás das bancadas (1,1 m da traseira delas; a
// estante a meio metro), para os retratos e os enfeites aparecerem grandes e
// pouco desfocados atrás dos experimentos (ADR 0012); a da frente fica longe,
// atrás de todas as câmeras.
const BACK_Z = -1.6;
const FRONT_Z = 5.5;
const ROOM = { width: 18, depth: FRONT_Z - BACK_Z, height: 3.4, centerZ: (FRONT_Z + BACK_Z) / 2 };

/**
 * Retratos, na ordem de `PORTRAITS`, em duas grades de duas colunas ao lado
 * da estante (que vai de −2,6 a 2,6 m). À esquerda, os físicos em três
 * fileiras de dois; à direita, as cientistas: duas fileiras de duas e Rosalind
 * Franklin centrada embaixo. A fileira de baixo fica acima das bancadas.
 */
const COLUMNS = { left: [-3.85, -3.25], right: [3.25, 3.85] } as const;
const ROWS = [2.91, 2.18, 1.45] as const;
const PORTRAIT_POSITIONS: readonly { x: number; y: number }[] = [
  // Newton, Einstein / Schrödinger, Heisenberg / Planck, Dirac
  ...ROWS.flatMap((y) => COLUMNS.left.map((x) => ({ x, y }))),
  // Curie, Noether / Meitner, Wu
  ...ROWS.slice(0, 2).flatMap((y) => COLUMNS.right.map((x) => ({ x, y }))),
  // Franklin
  { x: (COLUMNS.right[0] + COLUMNS.right[1]) / 2, y: ROWS[2] },
];

export function createLabRoom(materials: MaterialLibrary): LabRoom {
  const group = new THREE.Group();
  group.name = 'lab-room';

  const owned: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
  const glowing: THREE.Object3D[] = [];

  // --- Casca da sala -------------------------------------------------------
  const shell = new THREE.BoxGeometry(ROOM.width, ROOM.height, ROOM.depth);
  owned.push(shell);
  const walls = new THREE.Mesh(shell, materials.wall);
  walls.position.set(0, ROOM.height / 2, ROOM.centerZ);
  walls.receiveShadow = true;
  group.add(walls);

  const floorGeometry = new THREE.PlaneGeometry(ROOM.width, ROOM.depth);
  owned.push(floorGeometry);
  const floor = new THREE.Mesh(floorGeometry, materials.polishedConcrete);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.002, ROOM.centerZ);
  floor.receiveShadow = true;
  group.add(floor);

  // --- Prateleiras ao fundo: objetivas e câmeras antigas, e na do meio os
  // enfeites de física ------------------------------------------------------
  const shelves = createShelves(materials, owned);
  shelves.position.set(0, 0, BACK_Z + 0.36);
  group.add(shelves);
  const decor = createShelfDecor({ materials, top: SHELF_HEIGHTS[1] + 0.02 });
  shelves.add(decor.group);
  glowing.push(...decor.glowing);

  // --- Galeria de retratos ------------------------------------------------------
  const portraits = createPortraitWall({ materials, positions: PORTRAIT_POSITIONS, wallZ: BACK_Z });
  group.add(portraits.group);
  glowing.push(...portraits.glowing);

  // --- Cartazes retroiluminados -------------------------------------------
  // Três cartazes, uma malha: as três texturas vão lado a lado numa só, e
  // cada placa aponta para o seu terço. O mesmo para as bordas ciano. São
  // duas malhas no passe principal e no bloom, em vez de seis (SPEC §8).
  const posterData: { blur: number; label: string }[] = [
    { blur: 9, label: 'fora de foco' },
    { blur: 3, label: 'no limite' },
    { blur: 0, label: 'nítido' },
  ];

  const sources = posterData.map((data) => wallPosterTexture(data.blur, data.label));
  const first = sources[0]!.image as HTMLCanvasElement;
  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = first.width * sources.length;
  atlasCanvas.height = first.height;
  const atlasContext = atlasCanvas.getContext('2d');
  if (!atlasContext) throw new Error('Canvas 2D indisponível para os cartazes');
  sources.forEach((source, index) => {
    atlasContext.drawImage(source.image as HTMLCanvasElement, index * first.width, 0);
  });
  const atlas = new THREE.CanvasTexture(atlasCanvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 8;
  owned.push(atlas);

  const posterMaterial = new THREE.MeshStandardMaterial({
    map: atlas,
    emissiveMap: atlas,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.7,
    roughness: 0.9,
    metalness: 0,
  });
  owned.push(posterMaterial);

  const posterParts: THREE.BufferGeometry[] = [];
  const frameParts: THREE.BufferGeometry[] = [];
  posterData.forEach((_, index) => {
    const x = (index - 1) * 0.95;
    const y = 2.18;
    const z = BACK_Z + 0.02;

    const poster = new THREE.PlaneGeometry(0.72, 1.0);
    // Comprime o u da placa para o terço dela no atlas.
    const uv = poster.attributes.uv!;
    for (let i = 0; i < uv.count; i += 1) uv.setX(i, (uv.getX(i) + index) / posterData.length);
    posterParts.push(poster.translate(x, y, z));

    // Borda ciano fina, como um quadro de luz.
    frameParts.push(new THREE.PlaneGeometry(0.77, 1.05).translate(x, y, z - 0.006));
  });

  const postersGeometry = mergeGeometries(posterParts);
  const framesGeometry = mergeGeometries(frameParts);
  for (const part of [...posterParts, ...frameParts]) part.dispose();
  if (!postersGeometry || !framesGeometry) throw new Error('Falha ao mesclar os cartazes');
  owned.push(postersGeometry, framesGeometry);

  const posters = new THREE.Mesh(postersGeometry, posterMaterial);
  posters.name = 'posters';
  group.add(posters);
  glowing.push(posters);

  const frames = new THREE.Mesh(framesGeometry, materials.emissive(PALETTE.focus, 0.65));
  group.add(frames);
  glowing.push(frames);

  // --- Quadros nas paredes laterais ------------------------------------------
  // Átomo na parede direita, junto ao canto da estante; galáxia na esquerda.
  // Retroiluminados como os cartazes, com a moldura desenhada na textura. As
  // duas artes vão lado a lado numa textura só e os dois quadros são uma malha
  // só: um draw call por passe, não dois (SPEC §8).
  const atom = atomArtwork().image as HTMLCanvasElement;
  const galaxy = galaxyArtwork().image as HTMLCanvasElement;
  const artCanvas = document.createElement('canvas');
  artCanvas.width = atom.width + galaxy.width;
  artCanvas.height = Math.max(atom.height, galaxy.height);
  const artContext = artCanvas.getContext('2d');
  if (!artContext) throw new Error('Canvas 2D indisponível para os quadros');
  artContext.drawImage(atom, 0, 0);
  artContext.drawImage(galaxy, atom.width, 0);
  const artAtlas = new THREE.CanvasTexture(artCanvas);
  artAtlas.colorSpace = THREE.SRGBColorSpace;
  artAtlas.anisotropy = 8;
  owned.push(artAtlas);

  const artParts = [
    { half: 0, x: ROOM.width / 2 - 0.015, rotation: -Math.PI / 2 },
    { half: 1, x: -ROOM.width / 2 + 0.015, rotation: Math.PI / 2 },
  ].map(({ half, x, rotation }) => {
    const plane = new THREE.PlaneGeometry(1.6, 1.2);
    const uv = plane.attributes.uv!;
    for (let i = 0; i < uv.count; i += 1) uv.setX(i, (uv.getX(i) + half) / 2);
    return plane.rotateY(rotation).translate(x, 1.95, BACK_Z + 1.6);
  });
  const artGeometry = mergeGeometries(artParts);
  for (const part of artParts) part.dispose();
  if (!artGeometry) throw new Error('Falha ao mesclar os quadros');
  owned.push(artGeometry);

  const artMaterial = new THREE.MeshStandardMaterial({
    map: artAtlas,
    emissiveMap: artAtlas,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.75,
    roughness: 0.6,
    metalness: 0,
  });
  owned.push(artMaterial);
  const artworks = new THREE.Mesh(artGeometry, artMaterial);
  artworks.name = 'artworks';
  group.add(artworks);
  glowing.push(artworks);

  // --- Luzes ---------------------------------------------------------------
  // Luz principal quente, alta e à frente: é ela que dá o dourado do latão e
  // o verde vivo do vale, como no estúdio da referência.
  const keyLight = new THREE.DirectionalLight(0xffe8cc, 3.4);
  keyLight.position.set(0.6, 3.1, 2.9);
  keyLight.target.position.set(0, 0.9, 0);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 12;
  keyLight.shadow.camera.left = -3;
  keyLight.shadow.camera.right = 3;
  keyLight.shadow.camera.top = 3;
  keyLight.shadow.camera.bottom = -3;
  keyLight.shadow.bias = -0.0006;
  keyLight.shadow.radius = 6;
  keyLight.shadow.blurSamples = 16;
  group.add(keyLight);
  group.add(keyLight.target);

  // Faixas de teto: RectAreaLight não faz sombra, mas dá o reflexo alongado
  // característico nos metais e no vidro (SPEC §3.1).
  const ceilingStrips = new THREE.Group();
  const housingParts: THREE.BufferGeometry[] = [];
  // Uma luminária sobre cada bancada, mas uma luz de área só, que acompanha
  // a bancada ativa (`focusOn`). Cada luz de área custa em cada pixel de cada
  // material; com quatro bancadas, eram quatro, e as das bancadas vazias não
  // iluminavam nada que estivesse no quadro.
  // Mais curta que antes (5,2 m) para caber entre a parede do fundo e a
  // frente da sala; um pouco mais intensa para dar a mesma luz na bancada.
  const strip = new THREE.RectAreaLight(0xcfe0ff, 2.2, 0.34, STRIP_LENGTH);
  // Centrada um pouco à frente, para a ponta não atravessar a parede do fundo.
  strip.position.set(STATION_X[0] ?? 0, ROOM.height - 0.12, STRIP_Z);
  strip.rotation.x = -Math.PI / 2;
  ceilingStrips.add(strip);
  for (const x of STATION_X) {
    housingParts.push(
      new THREE.PlaneGeometry(0.34, STRIP_LENGTH)
        .rotateX(Math.PI / 2)
        .translate(x, ROOM.height - 0.124, STRIP_Z),
    );
  }
  // As luminárias, uma malha só.
  const housingGeometry = mergeGeometries(housingParts);
  for (const part of housingParts) part.dispose();
  if (!housingGeometry) throw new Error('Falha ao mesclar as luminárias');
  owned.push(housingGeometry);
  const housings = new THREE.Mesh(housingGeometry, materials.emissive(0xcfe0ff, 1.1));
  ceilingStrips.add(housings);
  glowing.push(housings);
  group.add(ceilingStrips);

  // Recorte frio por trás e de cima, sem sombra: acende as arestas do barril,
  // dos anéis e do vidro contra o fundo escuro.
  const rimLight = new THREE.DirectionalLight(0x9cc8ff, 1.6);
  rimLight.position.set(-1.4, 2.6, -3.2);
  rimLight.target.position.set(0, 1, 0);
  group.add(rimLight);
  group.add(rimLight.target);

  // Preenchimento frio fraco, só para a sombra não ficar preta chapada.
  const fill = new THREE.HemisphereLight(0x7890cc, 0x0a0806, 0.5);
  group.add(fill);

  // Luzes práticas: duas bastam — numa troca de bancada convivem no máximo
  // dois experimentos. Mesmo apagada, cada luz entra na conta de cada pixel.
  const pointLights = Array.from({ length: 2 }, () => {
    const light = new THREE.PointLight(0xffffff, 0, 1, 2);
    light.name = 'practical-light';
    group.add(light);
    return light;
  });
  const lent = new Set<THREE.PointLight>();

  return {
    group,
    keyLight,
    glowing,
    portraits,

    focusOn(x: number): void {
      strip.position.x = x;
      keyLight.position.x = x + 0.6;
      keyLight.target.position.x = x;
      rimLight.position.x = x - 1.4;
      rimLight.target.position.x = x;
    },

    borrowPointLight(): THREE.PointLight | null {
      const light = pointLights.find((candidate) => !lent.has(candidate)) ?? null;
      if (light) lent.add(light);
      return light;
    },

    returnPointLight(light: THREE.PointLight): void {
      if (!lent.delete(light)) return;
      light.intensity = 0;
    },

    applyShadowQuality(enabled: boolean, mapSize: number): void {
      keyLight.castShadow = enabled;
      if (keyLight.shadow.mapSize.x !== mapSize) {
        keyLight.shadow.mapSize.set(mapSize, mapSize);
        keyLight.shadow.map?.dispose();
        keyLight.shadow.map = null;
      }
    },

    dispose(): void {
      decor.dispose();
      portraits.dispose();
      for (const item of owned) item.dispose();
      owned.length = 0;
      group.clear();
    },
  };
}

/** Centro e comprimento das luminárias do teto, m: de −1,5 a 2,1 em z. */
const STRIP_Z = 0.3;
const STRIP_LENGTH = 3.6;

/** Alturas das três prateleiras; a do meio leva os enfeites. */
const SHELF_HEIGHTS = [0.58, 1.08, 1.58] as const;

/** Estante ao fundo com câmeras e objetivas antigas nas prateleiras de baixo e de cima. */
function createShelves(
  materials: MaterialLibrary,
  owned: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[],
): THREE.Group {
  const group = new THREE.Group();

  const boardGeometry = new THREE.BoxGeometry(5.2, 0.04, 0.42);
  owned.push(boardGeometry);

  const uprightGeometry = new THREE.BoxGeometry(0.06, 1.95, 0.44);
  owned.push(uprightGeometry);

  // Orçamento de draw calls (SPEC §8): cada malha é desenhada no passe
  // principal, no de sombra e no de transmissão do vidro. As peças fixas da
  // estante viram UMA geometria mesclada, e os objetos repetidos viram
  // InstancedMesh — de ~50 malhas para 4.
  const structure: THREE.BufferGeometry[] = [];
  for (const x of [-2.6, 0, 2.6]) {
    structure.push(uprightGeometry.clone().translate(x, 0.975, 0));
  }
  for (const y of SHELF_HEIGHTS) {
    structure.push(boardGeometry.clone().translate(0, y, 0));
  }
  const mergedStructure = mergeGeometries(structure);
  for (const part of structure) part.dispose();
  if (!mergedStructure) throw new Error('Falha ao mesclar a estrutura da estante');
  owned.push(mergedStructure);

  const frame = new THREE.Mesh(mergedStructure, materials.darkSteel);
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  // Corpos e objetivas: distribuídos de forma determinística, para a cena não
  // mudar entre capturas. Primeiro decide-se o que vai onde; depois cada tipo
  // vira um único InstancedMesh.
  const bodyGeometry = new THREE.BoxGeometry(0.16, 0.11, 0.09);
  const lensGeometry = new THREE.CylinderGeometry(0.045, 0.05, 0.1, 18);
  const hoodGeometry = new THREE.CylinderGeometry(0.058, 0.045, 0.05, 18);
  owned.push(bodyGeometry, lensGeometry, hoodGeometry);

  let seed = 7;
  const random = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const bodies: THREE.Matrix4[] = [];
  const lenses: THREE.Matrix4[] = [];
  const hoods: THREE.Matrix4[] = [];
  const rotation = new THREE.Quaternion();
  const unit = new THREE.Vector3(1, 1, 1);

  // A do meio fica para os enfeites de física (`shelf-decor.ts`).
  for (const y of [SHELF_HEIGHTS[0], SHELF_HEIGHTS[2]]) {
    for (let i = 0; i < 9; i += 1) {
      const x = -2.3 + i * 0.58 + (random() - 0.5) * 0.12;
      if (random() > 0.45) {
        const z = (random() - 0.5) * 0.06;
        rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (random() - 0.5) * 0.7);
        bodies.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.075, z), rotation, unit));
      } else {
        const z = (random() - 0.5) * 0.06;
        lenses.push(new THREE.Matrix4().makeTranslation(x, y + 0.07, z));
        hoods.push(new THREE.Matrix4().makeTranslation(x, y + 0.145, z));
      }
    }
  }

  const instanced = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    matrices: THREE.Matrix4[],
    castShadow: boolean,
  ): void => {
    if (matrices.length === 0) return;
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = castShadow;
    group.add(mesh);
  };

  instanced(bodyGeometry, materials.anodizedAluminum, bodies, true);
  instanced(lensGeometry, materials.anodizedAluminum, lenses, true);
  instanced(hoodGeometry, materials.brushedBrass, hoods, false);

  return group;
}
