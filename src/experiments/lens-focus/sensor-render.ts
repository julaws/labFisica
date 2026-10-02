import * as THREE from 'three';
import { DIORAMA_DEPTH, DIORAMA_K } from '../../scene/scale';
import { plateDistance } from '../../optics/thin-lens';

/**
 * Imagem no sensor (SPEC §6.6) — o diferencial deste laboratório.
 *
 * Uma câmera virtual no centro óptico da objetiva olha o diorama e renderiza
 * cor **e profundidade**. Um segundo passe converte, por pixel:
 *
 *     profundidade do buffer → distância ao longo do eixo óptico
 *                            → distância física em mm (inverso do mapa log)
 *                            → b(d) em mm, pela mesma fórmula do motor
 *                            → raio de desfoque em pixels
 *
 * Nada de "blur artístico": o raio de cada pixel sai do círculo de confusão
 * real daquele ponto da cena (SPEC §13). Fechar o diafragma encolhe todos os
 * discos porque `b` depende de N, não porque alguém baixou um parâmetro.
 *
 * ## Limitação declarada
 *
 * O passe é um **gather**: cada pixel recolhe os vizinhos que o cobririam.
 * Isso trata bem o fundo desfocado e razoavelmente o primeiro plano
 * desfocado sobre fundo nítido — um objeto borrado à frente sangra por cima,
 * mas não revela o que está exatamente atrás dele, porque essa informação não
 * existe num único buffer. Separar camadas near/far resolveria e fica como
 * item de polimento.
 *
 * ## Troca de objetiva (ADR 0007)
 *
 * O disco de cada pixel usa a forma geral `b = D·|p − v_d|/|v_d|`, com o
 * sensor parado a `p` do plano principal traseiro, e soma em quadratura o
 * borrão de aberração esférica da objetiva (`aberrationMm`). Assim a mesma
 * conta serve ao Gauss duplo, à lente simples (que borra mesmo focada) e à
 * divergente (cujo disco passa do tamanho do sensor). Quando o disco fica
 * maior que o kernel consegue amostrar, a cor vai para a média da cena: é a
 * luz espalhada sem imagem que um vidro fosco atrás de uma lente divergente
 * recebe de verdade.
 */

export interface SensorRender {
  /** Textura final, já desfocada. É o que vai para a placa e para o console. */
  readonly texture: THREE.Texture;
  /**
   * A câmera virtual. Precisa ser **filha do grupo do experimento**: o mapa de
   * profundidade é medido a partir da objetiva, não da origem do mundo.
   */
  readonly camera: THREE.PerspectiveCamera;
  /** Marca a imagem como desatualizada; o próximo quadro a recalcula. */
  invalidate(): void;
  /** Renderiza se estiver suja. Devolve true quando recalculou. */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene): boolean;
  setState(state: SensorState): void;
  setSize(width: number): void;
  dispose(): void;
}

export interface SensorState {
  /** Distância focal, mm, com sinal: negativa numa lente divergente. */
  readonly focalLength: number;
  readonly fNumber: number;
  /** Distância de foco, mm. */
  readonly focusDistance: number;
  readonly sensor: { w: number; h: number };
  /** Distância de casa do sensor ao plano principal traseiro, mm. */
  readonly homePlateMm: number;
  /** Borrão de aberração esférica no melhor foco, mm. */
  readonly aberrationMm: number;
}

export interface SensorRenderOptions {
  /** Camada que a câmera virtual enxerga: só o diorama. */
  readonly layer: number;
  /** Largura do render target, em pixels. */
  readonly size: number;
  /** Amostras do kernel de bokeh. */
  readonly samples: number;
  /** Lâminas do diafragma, que dão o formato do bokeh. */
  readonly blades: number;
  /** Posição da câmera virtual no eixo óptico, em unidades de cena. */
  readonly cameraX: number;
  /** Unidades de cena por milímetro na escala do diorama. */
  readonly sceneUnitsPerMm: number;
}

export function createSensorRender({
  layer,
  size,
  samples,
  blades,
  cameraX,
  sceneUnitsPerMm,
}: SensorRenderOptions): SensorRender {
  const aspect = 36 / 24;
  let width = size;
  let height = Math.round(size / aspect);

  const makeTarget = (w: number, h: number, withDepth: boolean): THREE.WebGLRenderTarget => {
    const target = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      colorSpace: THREE.SRGBColorSpace,
    });
    if (withDepth) {
      const depth = new THREE.DepthTexture(w, h);
      depth.type = THREE.UnsignedIntType;
      depth.minFilter = THREE.NearestFilter;
      depth.magFilter = THREE.NearestFilter;
      target.depthTexture = depth;
    }
    return target;
  };

  const sceneTarget = makeTarget(width, height, true);
  const blurTarget = makeTarget(width, height, false);

  // --- Câmera virtual --------------------------------------------------------
  // Olha no sentido −x, que é o lado do objeto. O FOV sai do sensor e do `v`
  // atual, não de um número escolhido: é a mesma relação que define o ângulo
  // de campo de uma objetiva real.
  const camera = new THREE.PerspectiveCamera(40, aspect, 0.01, 30);
  camera.layers.set(layer);
  camera.position.set(cameraX, 0, 0);
  camera.lookAt(cameraX - 1, 0, 0);

  // --- Passe de desfoque -----------------------------------------------------
  const quadScene = new THREE.Scene();
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const blurMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: sceneTarget.texture },
      tDepth: { value: sceneTarget.depthTexture },
      uResolution: { value: new THREE.Vector2(width, height) },
      uNear: { value: camera.near },
      uFar: { value: camera.far },
      uFocal: { value: 50 },
      uFNumber: { value: 2 },
      uPlateMm: { value: 54.5 },
      uAberrationMm: { value: 0 },
      uSensorWidthMm: { value: 36 },
      uCameraX: { value: cameraX },
      uSceneUnitsPerMm: { value: sceneUnitsPerMm },
      uDioramaK: { value: DIORAMA_K },
      uDioramaGap: { value: DIORAMA_DEPTH.gapScene },
      uDioramaMinMm: { value: DIORAMA_DEPTH.minMm },
      uDioramaMaxMm: { value: DIORAMA_DEPTH.maxMm },
      uMaxRadiusPx: { value: 28 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;

      uniform sampler2D tColor;
      uniform sampler2D tDepth;
      uniform vec2 uResolution;
      uniform float uNear;
      uniform float uFar;
      uniform float uFocal;
      uniform float uFNumber;
      uniform float uPlateMm;
      uniform float uAberrationMm;
      uniform float uSensorWidthMm;
      uniform float uCameraX;
      uniform float uSceneUnitsPerMm;
      uniform float uDioramaK;
      uniform float uDioramaGap;
      uniform float uDioramaMinMm;
      uniform float uDioramaMaxMm;
      uniform float uMaxRadiusPx;

      varying vec2 vUv;

      const int SAMPLES = ${samples};
      const float BLADES = ${blades}.0;
      const float PI = 3.14159265359;

      /** Profundidade do buffer → distância ao longo do eixo, em unidades. */
      float viewDistance(vec2 uv) {
        float depth = texture2D(tDepth, uv).x;
        // Sem geometria o buffer fica em 1.0: trata como o fundo da cena.
        if (depth >= 0.9999) return uFar;
        float ndc = depth * 2.0 - 1.0;
        return (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
      }

      /**
       * Distância física em mm. É o **inverso** do mapa de profundidade do
       * diorama: d = d_min · exp((offset − gap) / k).
       */
      float physicalDistance(float view) {
        float offset = view - uCameraX;
        float d = uDioramaMinMm * exp((offset - uDioramaGap) / uDioramaK);
        return clamp(d, uDioramaMinMm, uDioramaMaxMm);
      }

      /**
       * Diâmetro do disco no sensor em mm, igual ao do motor óptico
       * (plateBlurDiameter): b = D·|p − v|/|v|, mais a aberração esférica
       * da objetiva somada em quadratura.
       */
      float confusionDiameter(float d) {
        float v = uFocal * d / (d - uFocal);
        float defocus = abs(uFocal) / uFNumber * abs(uPlateMm - v) / max(abs(v), 1e-3);
        return sqrt(defocus * defocus + uAberrationMm * uAberrationMm);
      }

      /** Raio do disco em pixels, sem o teto do kernel. */
      float rawRadiusPixels(vec2 uv) {
        float d = physicalDistance(viewDistance(uv));
        return (confusionDiameter(d) * 0.5 / uSensorWidthMm) * uResolution.x;
      }

      /** Raio do disco de confusão em pixels do render target. */
      float radiusPixels(vec2 uv) {
        return min(rawRadiusPixels(uv), uMaxRadiusPx);
      }

      /** Média grosseira da cena: a cor da luz espalhada sem imagem. */
      vec3 sceneAverage() {
        vec3 sum = vec3(0.0);
        for (int y = 0; y < 4; y++) {
          for (int x = 0; x < 6; x++) {
            sum += texture2D(tColor, vec2((float(x) + 0.5) / 6.0, (float(y) + 0.5) / 4.0)).rgb;
          }
        }
        return sum / 24.0;
      }

      /**
       * Raio do polígono de N lados na direção theta, normalizado para 1 no
       * ponto médio das arestas. É o que dá ao bokeh o formato das lâminas.
       */
      float bladeShape(float theta) {
        // Atenção: não chamar isto de "half" — é palavra reservada em GLSL ES
        // 3.00, o shader inteiro deixa de compilar e a placa fica preta.
        float sector = 2.0 * PI / BLADES;
        float halfSector = sector * 0.5;
        float a = mod(theta, sector) - halfSector;
        return cos(halfSector) / cos(a);
      }

      void main() {
        vec2 texel = 1.0 / uResolution;
        float centerRadius = radiusPixels(vUv);
        vec3 color = texture2D(tColor, vUv).rgb;

        if (centerRadius < 0.75) {
          gl_FragColor = vec4(color, 1.0);
          return;
        }

        float centerDistance = physicalDistance(viewDistance(vUv));

        vec3 sum = color;
        float weight = 1.0;

        // Espiral de Vogel: distribuição uniforme sem padrão visível.
        const float GOLDEN = 2.39996323;
        for (int i = 1; i <= SAMPLES; i++) {
          float fi = float(i);
          float theta = fi * GOLDEN;
          float r = sqrt(fi / float(SAMPLES)) * centerRadius * bladeShape(theta);
          vec2 offset = vec2(cos(theta), sin(theta)) * r * texel;
          vec2 uv = vUv + offset;

          vec3 sampleColor = texture2D(tColor, uv).rgb;
          float sampleRadius = radiusPixels(uv);
          float sampleDistance = physicalDistance(viewDistance(uv));

          // A amostra contribui se o disco dela cobre o pixel central.
          float covered = smoothstep(r - 1.0, r + 1.0, sampleRadius);

          // Um vizinho MAIS PRÓXIMO e desfocado sangra por cima do fundo;
          // um vizinho mais distante não invade o que está nítido à frente.
          float nearer = step(sampleDistance, centerDistance);
          float w = max(covered, nearer * covered);

          sum += sampleColor * w;
          weight += w;
        }

        vec3 gathered = sum / weight;

        // Disco muito maior que o kernel: a luz de cada ponto cobre quase
        // o sensor inteiro, e o que sobra é a média da cena (ADR 0007).
        float spread = smoothstep(uMaxRadiusPx, uMaxRadiusPx * 6.0, rawRadiusPixels(vUv));
        gl_FragColor = vec4(mix(gathered, sceneAverage(), spread), 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMaterial);
  quad.frustumCulled = false;
  quadScene.add(quad);

  let dirty = true;
  let state: SensorState = {
    focalLength: 50,
    fNumber: 2,
    focusDistance: 600,
    sensor: { w: 36, h: 24 },
    homePlateMm: 50,
    aberrationMm: 0,
  };

  function applyState(): void {
    const plate = plateDistance(state.focalLength, state.focusDistance, state.homePlateMm);
    const distance = Number.isFinite(plate) ? plate : Math.abs(state.focalLength);

    // Meio ângulo vertical do campo: atan(altura/2 / p). É o FOV que uma
    // objetiva com esta extensão realmente cobre.
    camera.fov = (2 * Math.atan(state.sensor.h / 2 / distance) * 180) / Math.PI;
    camera.aspect = state.sensor.w / state.sensor.h;
    camera.updateProjectionMatrix();

    const uniforms = blurMaterial.uniforms;
    uniforms.uFocal!.value = state.focalLength;
    uniforms.uFNumber!.value = state.fNumber;
    uniforms.uPlateMm!.value = distance;
    uniforms.uAberrationMm!.value = state.aberrationMm;
    uniforms.uSensorWidthMm!.value = state.sensor.w;
  }

  applyState();

  return {
    get texture(): THREE.Texture {
      return blurTarget.texture;
    },

    camera,

    invalidate(): void {
      dirty = true;
    },

    render(renderer: THREE.WebGLRenderer, scene: THREE.Scene): boolean {
      if (!dirty) return false;
      dirty = false;

      const previousTarget = renderer.getRenderTarget();

      renderer.setRenderTarget(sceneTarget);
      renderer.clear();
      renderer.render(scene, camera);

      renderer.setRenderTarget(blurTarget);
      renderer.clear();
      renderer.render(quadScene, quadCamera);

      renderer.setRenderTarget(previousTarget);
      return true;
    },

    setState(next: SensorState): void {
      state = next;
      applyState();
      dirty = true;
    },

    setSize(nextWidth: number): void {
      if (nextWidth === width) return;
      width = nextWidth;
      height = Math.round(nextWidth / aspect);

      // Redimensiona no lugar: recriar os alvos trocaria o objeto textura, e a
      // placa e a tela do console continuariam presas ao antigo.
      sceneTarget.setSize(width, height);
      blurTarget.setSize(width, height);

      const resolution = blurMaterial.uniforms.uResolution!.value as THREE.Vector2;
      resolution.set(width, height);
      dirty = true;
    },

    dispose(): void {
      sceneTarget.dispose();
      blurTarget.dispose();
      blurMaterial.dispose();
      quad.geometry.dispose();
      quadScene.clear();
    },
  };
}

/** Camada reservada ao que a câmera virtual enxerga. */
export const SENSOR_LAYER = 3;

/** Marca um objeto e seus filhos como visíveis para a câmera virtual. */
export function markVisibleToSensor(object: THREE.Object3D): void {
  object.traverse((child) => child.layers.enable(SENSOR_LAYER));
}
