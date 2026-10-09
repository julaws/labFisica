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

/** O pedaço do renderer que o redimensionamento usa (um WebGLRenderer serve). */
export interface ResizableRenderer {
  readonly domElement: { readonly clientWidth: number; readonly clientHeight: number; readonly width: number; readonly height: number };
  setPixelRatio(value: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
}

/**
 * Redimensiona renderer e câmera ao tamanho do canvas. Devolve true se algo
 * mudou.
 *
 * A proporção da câmera é conferida à parte do tamanho do buffer: o
 * pós-processamento (`composer.setSize`) também redimensiona o canvas, e no
 * celular isso acontecia logo depois de a barra de endereço mudar a altura da
 * tela. O buffer ficava certo, a câmera não, e a imagem saía espremida na
 * horizontal até a próxima rotação.
 */
export function resizeToDisplaySize(
  renderer: ResizableRenderer,
  camera: THREE.PerspectiveCamera,
  maxPixelRatio = 2,
): boolean {
  const canvas = renderer.domElement;
  const pixelRatio = Math.min(window.devicePixelRatio, maxPixelRatio);
  const width = Math.floor(canvas.clientWidth * pixelRatio);
  const height = Math.floor(canvas.clientHeight * pixelRatio);
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);

  const bufferMatches = canvas.width === width && canvas.height === height;
  const aspectMatches = Math.abs(camera.aspect - aspect) < 1e-6;
  if (bufferMatches && aspectMatches) return false;

  if (!bufferMatches) {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  }
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  return true;
}
