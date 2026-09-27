import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import type { MaterialLibrary } from './materials';
import { PALETTE } from './materials';
import { wallPosterTexture } from './textures/procedural';

/**
 * A sala do laboratório (SPEC §3.1): estúdio escuro com profundidade, piso de
 * concreto polido, prateleiras ao fundo e três cartazes retroiluminados.
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
  applyShadowQuality(enabled: boolean, mapSize: number): void;
  dispose(): void;
}

const ROOM = { width: 9, depth: 11, height: 3.4 };

export function createLabRoom(materials: MaterialLibrary): LabRoom {
  const group = new THREE.Group();
  group.name = 'lab-room';

  const owned: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
  const glowing: THREE.Object3D[] = [];

  // --- Casca da sala -------------------------------------------------------
  const shell = new THREE.BoxGeometry(ROOM.width, ROOM.height, ROOM.depth);
  owned.push(shell);
  const walls = new THREE.Mesh(shell, materials.wall);
  walls.position.y = ROOM.height / 2;
  walls.receiveShadow = true;
  group.add(walls);

  const floorGeometry = new THREE.PlaneGeometry(ROOM.width, ROOM.depth);
  owned.push(floorGeometry);
  const floor = new THREE.Mesh(floorGeometry, materials.polishedConcrete);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.002;
  floor.receiveShadow = true;
  group.add(floor);

  // --- Prateleiras ao fundo, com objetivas e câmeras antigas ---------------
  const shelves = createShelves(materials, owned);
  shelves.position.set(0, 0, -ROOM.depth / 2 + 0.36);
  group.add(shelves);

  // --- Cartazes retroiluminados -------------------------------------------
  const posters = new THREE.Group();
  const posterData: { blur: number; label: string }[] = [
    { blur: 9, label: 'fora de foco' },
    { blur: 3, label: 'no limite' },
    { blur: 0, label: 'nítido' },
  ];

  const posterGeometry = new THREE.PlaneGeometry(0.72, 1.0);
  owned.push(posterGeometry);

  posterData.forEach((data, index) => {
    const texture = wallPosterTexture(data.blur, data.label);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      emissiveMap: texture,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.7,
      roughness: 0.9,
      metalness: 0,
    });
    owned.push(material);

    const poster = new THREE.Mesh(posterGeometry, material);
    poster.position.set((index - 1) * 0.95, 2.18, -ROOM.depth / 2 + 0.02);
    posters.add(poster);
    glowing.push(poster);

    // Borda ciano fina, como um quadro de luz.
    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(0.77, 1.05),
      materials.emissive(PALETTE.focus, 0.65),
    );
    frame.position.copy(poster.position);
    frame.position.z -= 0.006;
    posters.add(frame);
    glowing.push(frame);
    owned.push(frame.geometry);
  });

  group.add(posters);

  // --- Luzes ---------------------------------------------------------------
  const keyLight = new THREE.DirectionalLight(0xdfe9ff, 2.6);
  keyLight.position.set(1.15, 3.0, 2.7);
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
  for (const x of [-1.9, 1.9]) {
    const strip = new THREE.RectAreaLight(0xcfe0ff, 1.9, 0.34, 5.2);
    strip.position.set(x, ROOM.height - 0.12, -0.4);
    strip.rotation.x = -Math.PI / 2;
    ceilingStrips.add(strip);

    const housing = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 5.2),
      materials.emissive(0xcfe0ff, 1.1),
    );
    owned.push(housing.geometry);
    housing.position.copy(strip.position);
    housing.position.y -= 0.004;
    housing.rotation.x = Math.PI / 2;
    ceilingStrips.add(housing);
    glowing.push(housing);
  }
  group.add(ceilingStrips);

  // Preenchimento frio bem fraco, só para a sombra não ficar preta chapada.
  const fill = new THREE.HemisphereLight(0x6f86c8, 0x04060b, 0.34);
  group.add(fill);

  return {
    group,
    keyLight,
    glowing,

    applyShadowQuality(enabled: boolean, mapSize: number): void {
      keyLight.castShadow = enabled;
      if (keyLight.shadow.mapSize.x !== mapSize) {
        keyLight.shadow.mapSize.set(mapSize, mapSize);
        keyLight.shadow.map?.dispose();
        keyLight.shadow.map = null;
      }
    },

    dispose(): void {
      for (const item of owned) item.dispose();
      owned.length = 0;
      group.clear();
    },
  };
}

/** Estante ao fundo com silhuetas de câmeras e objetivas antigas. */
function createShelves(
  materials: MaterialLibrary,
  owned: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[],
): THREE.Group {
  const group = new THREE.Group();

  const boardGeometry = new THREE.BoxGeometry(5.2, 0.04, 0.42);
  owned.push(boardGeometry);

  const uprightGeometry = new THREE.BoxGeometry(0.06, 1.95, 0.44);
  owned.push(uprightGeometry);

  for (const x of [-2.6, 0, 2.6]) {
    const upright = new THREE.Mesh(uprightGeometry, materials.darkSteel);
    upright.position.set(x, 0.975, 0);
    upright.castShadow = true;
    group.add(upright);
  }

  // Corpos e objetivas: cilindros e caixas, distribuídos de forma
  // determinística para a cena não mudar entre capturas.
  const bodyGeometry = new THREE.BoxGeometry(0.16, 0.11, 0.09);
  const lensGeometry = new THREE.CylinderGeometry(0.045, 0.05, 0.1, 18);
  const hoodGeometry = new THREE.CylinderGeometry(0.058, 0.045, 0.05, 18);
  owned.push(bodyGeometry, lensGeometry, hoodGeometry);

  let seed = 7;
  const random = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  [0.58, 1.08, 1.58].forEach((y) => {
    const board = new THREE.Mesh(boardGeometry, materials.darkSteel);
    board.position.set(0, y, 0);
    board.castShadow = true;
    board.receiveShadow = true;
    group.add(board);

    for (let i = 0; i < 9; i += 1) {
      const x = -2.3 + i * 0.58 + (random() - 0.5) * 0.12;
      if (random() > 0.45) {
        const body = new THREE.Mesh(bodyGeometry, materials.anodizedAluminum);
        body.position.set(x, y + 0.075, (random() - 0.5) * 0.06);
        body.rotation.y = (random() - 0.5) * 0.7;
        body.castShadow = true;
        group.add(body);
      } else {
        const lens = new THREE.Mesh(lensGeometry, materials.anodizedAluminum);
        lens.position.set(x, y + 0.07, (random() - 0.5) * 0.06);
        lens.castShadow = true;
        group.add(lens);

        const hood = new THREE.Mesh(hoodGeometry, materials.brushedBrass);
        hood.position.set(x, y + 0.145, lens.position.z);
        group.add(hood);
      }
    }
  });

  return group;
}
