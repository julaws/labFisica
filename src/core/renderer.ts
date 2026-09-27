import * as THREE from 'three';

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  /** Limite superior de devicePixelRatio; a qualidade adaptativa ajusta depois (SPEC §8). */
  maxPixelRatio?: number;
}

/**
 * Cria o WebGLRenderer com o espaço de cor, o tone mapping e as sombras da SPEC §3.1.
 * Projetado para migrar a WebGPURenderer depois: nada fora deste módulo fala com a API
 * do renderizador diretamente.
 */
export function createRenderer({ canvas, maxPixelRatio = 2 }: RendererOptions): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // o SMAA do pós-processamento cuida disso (SPEC §4)
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;

  // Com pós-processamento, cada passe chama render() e zeraria os contadores.
  // Somamos o quadro inteiro e zeramos manualmente no loop.
  renderer.info.autoReset = false;

  return renderer;
}

/** Redimensiona renderer e câmera ao tamanho do canvas. Devolve true se algo mudou. */
export function resizeToDisplaySize(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  maxPixelRatio = 2,
): boolean {
  const canvas = renderer.domElement;
  const pixelRatio = Math.min(window.devicePixelRatio, maxPixelRatio);
  const width = Math.floor(canvas.clientWidth * pixelRatio);
  const height = Math.floor(canvas.clientHeight * pixelRatio);

  if (canvas.width === width && canvas.height === height) return false;

  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  camera.aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  camera.updateProjectionMatrix();
  return true;
}
