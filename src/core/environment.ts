import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

/**
 * Iluminação por HDRI (SPEC §3.1 e §4).
 *
 * O mapa é pré-filtrado com PMREM e usado **só como ambiente e reflexo**: o
 * fundo continua sendo a sala modelada, porque o laboratório tem paredes e
 * prateleiras próprias. A luz principal com sombra é uma DirectionalLight
 * separada, montada em `scene/lab-room.ts`.
 *
 * Asset: `public/env/studio_small_09_1k.hdr`, Poly Haven, CC0 1.0.
 * Registrado em CREDITS.md.
 */

export const HDRI_URL = 'env/studio_small_09_1k.hdr';

export interface EnvironmentHandle {
  readonly texture: THREE.Texture;
  dispose(): void;
}

export interface EnvironmentOptions {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  url?: string;
  /** Intensidade do ambiente; a sala é escura, então fica abaixo de 1. */
  intensity?: number;
  onProgress?: (fraction: number) => void;
}

export async function loadEnvironment({
  renderer,
  scene,
  url = HDRI_URL,
  intensity = 0.38,
  onProgress,
}: EnvironmentOptions): Promise<EnvironmentHandle> {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const loader = new HDRLoader();

  const hdr = await new Promise<THREE.DataTexture>((resolve, reject) => {
    loader.load(
      url,
      (texture) => resolve(texture),
      (event) => {
        if (onProgress && event.lengthComputable) onProgress(event.loaded / event.total);
      },
      (error: unknown) => reject(error instanceof Error ? error : new Error(String(error))),
    );
  });

  const target = pmrem.fromEquirectangular(hdr);
  hdr.dispose();
  pmrem.dispose();

  scene.environment = target.texture;
  scene.environmentIntensity = intensity;

  return {
    texture: target.texture,
    dispose(): void {
      scene.environment = null;
      target.dispose();
    },
  };
}
