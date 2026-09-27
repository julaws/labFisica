import * as THREE from 'three';
import {
  anodizedRoughness,
  brushedMetalRoughness,
  concreteNormal,
  concreteRoughness,
  knurledNormal,
  woodColor,
} from './textures/procedural';

/**
 * Biblioteca de materiais PBR do laboratório (SPEC §3.1 e §7).
 *
 * Os materiais são criados uma vez e compartilhados: a bancada inteira usa
 * quatro ou cinco deles, o que ajuda a ficar dentro do orçamento de draw calls
 * (SPEC §8). Quem precisa de uma variação pede um clone.
 */

export interface MaterialLibrary {
  /** Alumínio anodizado preto fosco: barril da lente, trilho, carrinhos. */
  readonly anodizedAluminum: THREE.MeshPhysicalMaterial;
  /** Latão escovado: anéis, parafusos de fixação. */
  readonly brushedBrass: THREE.MeshPhysicalMaterial;
  /** Borracha serrilhada do anel de foco. */
  readonly knurledRubber: THREE.MeshPhysicalMaterial;
  /** Concreto polido do piso, com reflexo suave. */
  readonly polishedConcrete: THREE.MeshPhysicalMaterial;
  /** Parede grafite-azulada. */
  readonly wall: THREE.MeshStandardMaterial;
  /** Corpo escuro do console da bancada. */
  readonly benchBody: THREE.MeshPhysicalMaterial;
  /** Madeira da bandeja do diorama. */
  readonly trayWood: THREE.MeshStandardMaterial;
  /** Aço escuro das prateleiras. */
  readonly darkSteel: THREE.MeshStandardMaterial;

  /** Emissivo de cor e intensidade arbitrárias, cacheado por chave. */
  emissive(color: THREE.ColorRepresentation, intensity?: number): THREE.MeshStandardMaterial;
  dispose(): void;
}

/** Tokens de cor da SPEC §3.2, disponíveis para a cena. */
export const PALETTE = {
  ink: 0x0b0f1a,
  focus: 0x7fe3ff,
  brass: 0xc8923a,
  warm: 0xffb45c,
  cool: 0x9c8cff,
  text: 0xe6eaf2,
} as const;

export function createMaterialLibrary(): MaterialLibrary {
  const owned: (THREE.Material | THREE.Texture)[] = [];
  const track = <T extends THREE.Material>(material: T): T => {
    owned.push(material);
    return material;
  };

  const anodizedAluminum = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x14171c,
      metalness: 0.92,
      roughness: 0.52,
      roughnessMap: anodizedRoughness(),
      clearcoat: 0.12,
      clearcoatRoughness: 0.6,
    }),
  );

  const brushedBrass = track(
    new THREE.MeshPhysicalMaterial({
      color: PALETTE.brass,
      metalness: 1,
      roughness: 0.34,
      roughnessMap: brushedMetalRoughness(),
      anisotropy: 0.7,
      anisotropyRotation: Math.PI / 2,
    }),
  );

  const knurledRubber = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x0e1014,
      metalness: 0,
      roughness: 0.82,
      normalMap: knurledNormal(),
      normalScale: new THREE.Vector2(1.1, 1.1),
      sheen: 0.2,
      sheenRoughness: 0.9,
      sheenColor: new THREE.Color(0x2a3140),
    }),
  );

  const concreteNormalMap = concreteNormal();
  concreteNormalMap.repeat.set(6, 6);
  const concreteRoughnessMap = concreteRoughness();
  concreteRoughnessMap.repeat.set(6, 6);

  const polishedConcrete = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x0a0d14,
      metalness: 0.05,
      roughness: 0.46,
      roughnessMap: concreteRoughnessMap,
      normalMap: concreteNormalMap,
      normalScale: new THREE.Vector2(0.22, 0.22),
      clearcoat: 0.14,
      clearcoatRoughness: 0.34,
    }),
  );

  const wall = track(
    new THREE.MeshStandardMaterial({
      color: 0x121722,
      roughness: 0.94,
      metalness: 0,
      side: THREE.BackSide,
    }),
  );

  const benchBody = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x0c1018,
      roughness: 0.5,
      metalness: 0.15,
      clearcoat: 0.18,
      clearcoatRoughness: 0.4,
    }),
  );

  const trayWood = track(
    new THREE.MeshStandardMaterial({
      map: woodColor(),
      roughness: 0.72,
      metalness: 0,
    }),
  );

  const darkSteel = track(
    new THREE.MeshStandardMaterial({
      color: 0x1c212c,
      roughness: 0.55,
      metalness: 0.8,
    }),
  );

  const emissiveCache = new Map<string, THREE.MeshStandardMaterial>();

  return {
    anodizedAluminum,
    brushedBrass,
    knurledRubber,
    polishedConcrete,
    wall,
    benchBody,
    trayWood,
    darkSteel,

    emissive(color, intensity = 1): THREE.MeshStandardMaterial {
      const key = `${new THREE.Color(color).getHexString()}-${intensity}`;
      const cached = emissiveCache.get(key);
      if (cached) return cached;

      const material = track(
        new THREE.MeshStandardMaterial({
          color: 0x000000,
          emissive: new THREE.Color(color),
          emissiveIntensity: intensity,
          roughness: 1,
          metalness: 0,
          toneMapped: true,
        }),
      );
      emissiveCache.set(key, material);
      return material;
    },

    dispose(): void {
      for (const item of owned) item.dispose();
      owned.length = 0;
      emissiveCache.clear();
    },
  };
}
