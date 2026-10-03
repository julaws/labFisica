import * as THREE from 'three';

/**
 * Guarda os programas de shader de um experimento depois que ele sai de cena
 * (ADR 0008).
 *
 * O three apaga um programa quando o último material que o usa é descartado.
 * Como cada experimento descarta os seus materiais ao sair, voltar a ele
 * recompilava tudo: ~10 programas, quase 2 s de tela parada num driver
 * Direct3D. O guardião mantém, para cada material, uma cópia leve presa a um
 * objeto mínimo do mesmo tipo, numa cena que nunca é desenhada. Compiladas
 * contra a cena real (mesmas luzes, mesmo ambiente), as cópias geram a mesma
 * chave de programa que o original — e o programa sobrevive.
 *
 * As cópias não seguram as texturas do original (trocadas por texturas vazias
 * com os mesmos parâmetros que entram na chave), nem a geometria (trocada por
 * uma de três vértices com os mesmos atributos).
 */

export interface ProgramKeeper {
  /** Guarda os programas dos materiais dos objetos (e descendentes). */
  retain(objects: Iterable<THREE.Object3D>): void;
  /** Quantos materiais estão guardados. */
  readonly size: number;
  dispose(): void;
}

type Drawable = THREE.Mesh | THREE.Points | THREE.Line;

const isDrawable = (object: THREE.Object3D): object is Drawable =>
  (object as THREE.Mesh).isMesh === true ||
  (object as THREE.Points).isPoints === true ||
  (object as THREE.Line).isLine === true;

export function createProgramKeeper(
  renderer: THREE.WebGLRenderer,
  camera: THREE.Camera,
  targetScene: THREE.Scene,
): ProgramKeeper {
  const keeperScene = new THREE.Scene();
  const owned: (THREE.Material | THREE.BufferGeometry | THREE.Texture)[] = [];
  // A cena é sempre desenhada num render target do pós-processamento, e o
  // espaço de cor de saída entra na chave do programa: compilar direto para o
  // canvas geraria chaves que nunca casam com as reais.
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  // Sombras e profundidade de campo desenham cada objeto com um material de
  // profundidade; uma variante por tipo de objeto basta.
  const depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  owned.push(depthMaterial);
  const depthKinds = new Set<string>();
  /** Chave do material original mais o tipo do objeto: uma cópia por par. */
  const kept = new Set<string>();

  /** Textura vazia com o que entra na chave do programa: canal e espaço de cor. */
  const placeholder = (texture: THREE.Texture): THREE.Texture => {
    const copy = (texture as THREE.CubeTexture).isCubeTexture ? new THREE.CubeTexture() : new THREE.Texture();
    copy.channel = texture.channel;
    copy.colorSpace = texture.colorSpace;
    copy.mapping = texture.mapping;
    owned.push(copy);
    return copy;
  };

  const copyMaterial = (material: THREE.Material): THREE.Material => {
    const copy = material.clone();
    // `clone` não leva o que muda o shader por fora dos parâmetros. Tem de ser
    // a mesma função, não um invólucro: a chave padrão é o texto dela.
    /* eslint-disable @typescript-eslint/unbound-method */
    copy.onBeforeCompile = material.onBeforeCompile;
    copy.customProgramCacheKey = material.customProgramCacheKey;
    /* eslint-enable @typescript-eslint/unbound-method */
    const record = copy as unknown as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const value = record[key] as THREE.Texture | null | undefined;
      if (value?.isTexture === true) record[key] = placeholder(value);
    }
    // Uniformes não entram na chave: sem eles, a cópia não segura texturas.
    const shader = copy as THREE.ShaderMaterial;
    if (shader.isShaderMaterial) {
      for (const uniform of Object.values(shader.uniforms)) {
        if ((uniform.value as THREE.Texture | null)?.isTexture) uniform.value = null;
      }
    }
    owned.push(copy);
    return copy;
  };

  const copyGeometry = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => {
    const copy = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const size = attribute.itemSize;
      copy.setAttribute(name, new THREE.BufferAttribute(new Float32Array(size * 3), size, attribute.normalized));
    }
    // Nenhum experimento usa morph targets; se usar, eles entram aqui.
    owned.push(copy);
    return copy;
  };

  const proxyFor = (object: Drawable, geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Object3D => {
    const instanced = object as THREE.InstancedMesh;
    if (instanced.isInstancedMesh) {
      const proxy = new THREE.InstancedMesh(geometry, material, 1);
      if (instanced.instanceColor) proxy.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3), 3);
      return proxy;
    }
    if ((object as THREE.Points).isPoints) return new THREE.Points(geometry, material);
    if ((object as THREE.LineSegments).isLineSegments) return new THREE.LineSegments(geometry, material);
    if ((object as THREE.Line).isLine) return new THREE.Line(geometry, material);
    return new THREE.Mesh(geometry, material);
  };

  return {
    retain(objects: Iterable<THREE.Object3D>): void {
      let added = 0;
      for (const root of objects) {
        root.traverse((object) => {
          if (!isDrawable(object)) return;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) {
            const key = `${object.type}:${material.uuid}`;
            if (kept.has(key)) continue;
            kept.add(key);
            const proxy = proxyFor(object, copyGeometry(object.geometry), copyMaterial(material));
            proxy.frustumCulled = false;
            keeperScene.add(proxy);
            added += 1;
          }
          const instanced = object as THREE.InstancedMesh;
          const kind = `${object.type}:${instanced.instanceColor ? 1 : 0}`;
          if ((object as THREE.Mesh).isMesh && !depthKinds.has(kind)) {
            depthKinds.add(kind);
            keeperScene.add(proxyFor(object, copyGeometry(object.geometry), depthMaterial));
            added += 1;
          }
        });
      }
      // Programas que já existem são só reaproveitados: barato.
      if (added === 0) return;
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.compile(keeperScene, camera, targetScene);
      renderer.setRenderTarget(previous);
    },

    get size(): number {
      return kept.size;
    },

    dispose(): void {
      for (const item of owned) item.dispose();
      owned.length = 0;
      target.dispose();
      kept.clear();
      depthKinds.clear();
      keeperScene.clear();
    },
  };
}
