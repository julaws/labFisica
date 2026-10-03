import * as THREE from 'three';
import {
  BREADBOARD_HOLES_PER_TILE,
  anodizedRoughness,
  beadBlastNormal,
  breadboardMaps,
  brushedMetalRoughness,
  concreteNormal,
  concreteRoughness,
  knurledNormal,
  powderCoatMaps,
  woodColor,
} from './textures/procedural';

/** Passo da furação da mesa óptica em unidades de cena (25 mm na escala do trilho). */
export const BREADBOARD_PITCH = 0.058;

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
  /**
   * Tampo de mesa óptica (alumínio anodizado com furação em grade). As
   * texturas se repetem a cada `BREADBOARD_PITCH` × 4: a malha usa UV em
   * metros de cena.
   */
  readonly breadboard: THREE.MeshPhysicalMaterial;
  /** Tampo da bancada, em volta da mesa óptica: laminado fenólico escuro. */
  readonly benchTop: THREE.MeshPhysicalMaterial;

  /**
   * Liga ou desliga os detalhes de superfície (normal maps, mapas de
   * rugosidade, verniz, anisotropia) de todos os materiais da biblioteca: o
   * modo leve troca realismo por desempenho. Recompila os shaders uma vez.
   */
  setDetail(high: boolean): void;

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
      // Jateado antes de anodizar: grão fino que quebra o reflexo em véu.
      normalMap: beadBlastNormal(),
      normalScale: new THREE.Vector2(0.07, 0.07),
      clearcoat: 0.22,
      clearcoatRoughness: 0.45,
      envMapIntensity: 1.15,
    }),
  );

  const brushedBrass = track(
    new THREE.MeshPhysicalMaterial({
      // Um tom abaixo do token de interface: sob a luz quente e o AgX, o
      // #C8923A puro lava para bege. Este lê como latão envelhecido.
      color: 0xa85a16,
      metalness: 1,
      roughness: 0.52,
      roughnessMap: brushedMetalRoughness(),
      anisotropy: 0.25,
      anisotropyRotation: Math.PI / 2,
      // As caixas de luz do HDRI de estúdio estouram o metal polido em
      // branco. Com menos ambiente, o latão reflete a sala escura e fica
      // cor de latão, com o brilho quente da luz principal por cima.
      envMapIntensity: 0.45,
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

  // Corpo da bancada: aço com pintura eletrostática grafite. A casca de
  // laranja e a rugosidade manchada fazem o reflexo das luminárias se
  // espalhar como numa peça pintada de verdade, não num plástico liso.
  const powder = powderCoatMaps();
  for (const texture of [powder.normalMap, powder.roughnessMap]) texture.repeat.set(2.5, 2.5);
  const benchBody = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x131821,
      roughness: 1,
      roughnessMap: powder.roughnessMap,
      normalMap: powder.normalMap,
      normalScale: new THREE.Vector2(0.22, 0.22),
      metalness: 0.2,
      clearcoat: 0.3,
      clearcoatRoughness: 0.32,
    }),
  );

  // O tampo recebe as luminárias em cheio: mais escuro e mais fosco que o
  // corpo, com o mesmo grão, para não lavar (SPEC §3.1).
  const benchTop = track(benchBody.clone());
  benchTop.color.setHex(0x0a0d12);
  benchTop.normalScale.set(0.12, 0.12);
  benchTop.clearcoat = 0.22;
  benchTop.clearcoatRoughness = 0.5;

  const board = breadboardMaps();
  for (const texture of [board.map, board.roughnessMap, board.normalMap]) {
    texture.repeat.set(1 / (BREADBOARD_PITCH * BREADBOARD_HOLES_PER_TILE), 1 / (BREADBOARD_PITCH * BREADBOARD_HOLES_PER_TILE));
    texture.anisotropy = 8;
  }
  const breadboard = track(
    new THREE.MeshPhysicalMaterial({
      map: board.map,
      roughness: 1,
      roughnessMap: board.roughnessMap,
      normalMap: board.normalMap,
      normalScale: new THREE.Vector2(0.9, 0.9),
      metalness: 0.55,
      clearcoat: 0.15,
      clearcoatRoughness: 0.5,
      envMapIntensity: 1.1,
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
      normalMap: beadBlastNormal(),
      normalScale: new THREE.Vector2(0.06, 0.06),
    }),
  );

  // Detalhes de superfície guardados para o modo leve poder tirá-los e
  // devolvê-los (normal map, rugosidade, verniz, anisotropia).
  interface Detail {
    readonly material: THREE.MeshStandardMaterial;
    readonly normalMap: THREE.Texture | null;
    readonly roughnessMap: THREE.Texture | null;
    readonly roughness: number;
    readonly clearcoat: number;
    readonly anisotropy: number;
  }
  let details: Detail[] | null = null;
  let detailHigh = true;

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
    breadboard,
    benchTop,

    setDetail(high: boolean): void {
      if (high === detailHigh) return;
      detailHigh = high;
      details ??= owned
        .filter((item): item is THREE.MeshStandardMaterial => item instanceof THREE.MeshStandardMaterial)
        .map((material) => ({
          material,
          normalMap: material.normalMap,
          roughnessMap: material.roughnessMap,
          roughness: material.roughness,
          clearcoat: material instanceof THREE.MeshPhysicalMaterial ? material.clearcoat : 0,
          anisotropy: material instanceof THREE.MeshPhysicalMaterial ? material.anisotropy : 0,
        }));
      for (const detail of details) {
        const { material } = detail;
        material.normalMap = high ? detail.normalMap : null;
        material.roughnessMap = high ? detail.roughnessMap : null;
        // Sem o mapa, a rugosidade fica perto do valor médio que ele dava
        // (os mapas da biblioteca giram em torno de 0,55).
        material.roughness = high || !detail.roughnessMap ? detail.roughness : detail.roughness * 0.55;
        if (material instanceof THREE.MeshPhysicalMaterial) {
          material.clearcoat = high ? detail.clearcoat : 0;
          material.anisotropy = high ? detail.anisotropy : 0;
        }
        material.needsUpdate = true;
      }
    },

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
