import * as THREE from 'three';
import { Pass } from 'postprocessing';
import { DIORAMA_DEPTH, DIORAMA_K } from '../../scene/scale';

/**
 * Desfoque do vale pela objetiva (pedido de 03/10/2026): o que está longe do
 * plano de foco aparece borrado na própria cena, não só na imagem do vidro
 * fosco. É uma visualização conceitual, declarada no modal.
 *
 * Uma passagem de pós-processamento, sem desenhar a cena de novo:
 *
 * 1. **Disco por pixel.** A partir do buffer de profundidade, reconstrói a
 *    posição de cada pixel no mundo e leva para o referencial do diorama. Se
 *    o pixel cai na bandeja do vale, a posição ao longo do eixo vira
 *    distância física pelo mesmo mapa logarítmico da cena (`scale.ts`), e a
 *    distância vira o disco de desfoque pela mesma fórmula do motor
 *    (`plateBlurDiameter`): b = D·|p − v|/|v|, v = f·d/(d − f), D = |f|/N.
 *    O raio do borrão na tela é proporcional a b, com teto.
 * 2. **Borrão.** Cada pixel do vale junta vizinhos num disco do seu raio
 *    (ângulo áureo). Um vizinho só entra se o próprio raio dele alcança o
 *    pixel: assim o que está nítido não vaza para o fundo borrado, e a
 *    bancada em volta não entra no vale.
 */

export interface SceneBlurInputs {
  readonly camera: THREE.PerspectiveCamera;
  /** Matriz de mundo do grupo do diorama. */
  readonly dioramaMatrixWorld: THREE.Matrix4;
  /** Distância focal (mm, negativa na divergente), número f e distância do sensor (mm). */
  readonly focalLength: number;
  readonly fNumber: number;
  readonly plateDistance: number;
}

export interface DioramaBox {
  /** Limites no referencial do diorama, em unidades de cena. */
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly halfWidth: number;
}

/** Raio do borrão por milímetro de disco, em pixels a 900 px de altura. */
const PX_PER_MM = 6;
const MAX_RADIUS_PX = 10;
const TAPS = 24;

const FULLSCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

export class DioramaBlurPass extends Pass {
  private readonly cocMaterial: THREE.ShaderMaterial;
  private readonly blurMaterial: THREE.ShaderMaterial;
  private readonly cocTarget: THREE.WebGLRenderTarget;
  private readonly inverse = new THREE.Matrix4();

  constructor(box: DioramaBox) {
    super('DioramaBlurPass');
    this.needsDepthTexture = true;
    this.cocTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });

    this.cocMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: null },
        uProjectionInverse: { value: new THREE.Matrix4() },
        uCameraWorld: { value: new THREE.Matrix4() },
        uDioramaInverse: { value: new THREE.Matrix4() },
        uBoxMin: { value: new THREE.Vector3(box.xMin, box.yMin, -box.halfWidth) },
        uBoxMax: { value: new THREE.Vector3(box.xMax, box.yMax, box.halfWidth) },
        uMap: { value: new THREE.Vector4(DIORAMA_DEPTH.minMm, DIORAMA_DEPTH.maxMm, DIORAMA_DEPTH.gapScene, DIORAMA_K) },
        uLens: { value: new THREE.Vector3(50, 25, 50) },
        uScale: { value: 1 },
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: /* glsl */ `
        uniform highp sampler2D tDepth;
        uniform mat4 uProjectionInverse;
        uniform mat4 uCameraWorld;
        uniform mat4 uDioramaInverse;
        uniform vec3 uBoxMin;
        uniform vec3 uBoxMax;
        uniform vec4 uMap;   // distância mínima e máxima (mm), folga e k do mapa logarítmico
        uniform vec3 uLens;  // f (mm), D = |f|/N (mm), p (mm)
        uniform float uScale;
        varying vec2 vUv;
        void main() {
          float depth = texture2D(tDepth, vUv).r;
          if (depth >= 1.0) { gl_FragColor = vec4(0.0); return; }
          vec4 view = uProjectionInverse * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
          view /= view.w;
          vec3 local = (uDioramaInverse * (uCameraWorld * view)).xyz;
          // Fora da bandeja: nada a borrar. Bordas suaves de 1 cm.
          vec3 inside = smoothstep(uBoxMin - 0.01, uBoxMin + 0.01, local) * (1.0 - smoothstep(uBoxMax - 0.01, uBoxMax + 0.01, local));
          float mask = inside.x * inside.y * inside.z;
          if (mask <= 0.0) { gl_FragColor = vec4(0.0); return; }
          // Afastamento ao longo do eixo → distância física (mapa da cena).
          float d = clamp(uMap.x * exp((-local.x - uMap.z) / uMap.w), uMap.x, uMap.y);
          // Disco no sensor, como plateBlurDiameter no motor.
          float f = uLens.x;
          float v = abs(d - f) < 1e-3 ? 1e6 : f * d / (d - f);
          float b = uLens.y * abs(uLens.z - v) / max(abs(v), 1e-3);
          float radius = min(b * ${PX_PER_MM.toFixed(1)}, ${MAX_RADIUS_PX.toFixed(1)}) * uScale * mask;
          gl_FragColor = vec4(radius, 0.0, 0.0, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    this.blurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tCoc: { value: this.cocTarget.texture },
        uTexel: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor;
        uniform sampler2D tCoc;
        uniform vec2 uTexel;
        varying vec2 vUv;
        void main() {
          vec4 center = texture2D(tColor, vUv);
          float r = texture2D(tCoc, vUv).r;
          if (r < 0.5) { gl_FragColor = center; return; }
          vec3 sum = center.rgb;
          float total = 1.0;
          for (int i = 0; i < ${TAPS}; i++) {
            float fi = float(i) + 0.5;
            float dist = r * sqrt(fi / ${TAPS.toFixed(1)});
            float angle = fi * 2.39996323;
            vec2 uv = vUv + vec2(cos(angle), sin(angle)) * dist * uTexel;
            // O vizinho só entra se o borrão dele alcança este pixel.
            float w = clamp(texture2D(tCoc, uv).r - dist + 1.0, 0.0, 1.0);
            sum += texture2D(tColor, uv).rgb * w;
            total += w;
          }
          gl_FragColor = vec4(sum / total, center.a);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    this.fullscreenMaterial = this.blurMaterial;
  }

  override setDepthTexture(depthTexture: THREE.Texture): void {
    this.cocMaterial.uniforms.tDepth!.value = depthTexture;
  }

  override setSize(width: number, height: number): void {
    this.cocTarget.setSize(width, height);
    (this.blurMaterial.uniforms.uTexel!.value as THREE.Vector2).set(1 / width, 1 / height);
    // O teto do borrão vale para 900 px de altura; telas maiores borram mais pixels.
    this.cocMaterial.uniforms.uScale!.value = height / 900;
  }

  /** Atualiza câmera, diorama e objetiva. Chamado a cada quadro. */
  update(inputs: SceneBlurInputs): void {
    const u = this.cocMaterial.uniforms;
    (u.uProjectionInverse!.value as THREE.Matrix4).copy(inputs.camera.projectionMatrixInverse);
    (u.uCameraWorld!.value as THREE.Matrix4).copy(inputs.camera.matrixWorld);
    (u.uDioramaInverse!.value as THREE.Matrix4).copy(this.inverse.copy(inputs.dioramaMatrixWorld).invert());
    (u.uLens!.value as THREE.Vector3).set(
      inputs.focalLength,
      Math.abs(inputs.focalLength) / inputs.fNumber,
      inputs.plateDistance,
    );
  }

  override render(
    renderer: THREE.WebGLRenderer,
    inputBuffer: THREE.WebGLRenderTarget,
    outputBuffer: THREE.WebGLRenderTarget | null,
  ): void {
    // 1. Raio do borrão por pixel.
    this.fullscreenMaterial = this.cocMaterial;
    renderer.setRenderTarget(this.cocTarget);
    renderer.render(this.scene, this.camera);
    // 2. Borrão da cor.
    this.blurMaterial.uniforms.tColor!.value = inputBuffer.texture;
    this.fullscreenMaterial = this.blurMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
    renderer.render(this.scene, this.camera);
  }

  override dispose(): void {
    this.cocTarget.dispose();
    this.cocMaterial.dispose();
    this.blurMaterial.dispose();
    super.dispose();
  }
}
