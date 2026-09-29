import * as THREE from 'three';
import { PALETTE } from '../../scene/materials';
import { distanceToSceneX } from './diorama';

/**
 * Plano de foco e zona nítida (SPEC §6.5).
 *
 * A lâmina não é um plano matemático: ela tem **espessura**, porque a zona
 * nítida é um volume. As duas faces ficam nas posições mapeadas dos limites
 * próximo e distante que o motor calcula, então a espessura na cena cresce e
 * encolhe junto com a profundidade de campo real.
 *
 * A mesma faixa vai para os materiais do diorama pela `intersectionPatch`, que
 * acende a superfície onde ela é cortada — é a linha brilhante do site de
 * referência, só que aqui ela acende exatamente onde a física manda.
 */

export interface FocusPlane {
  readonly group: THREE.Group;
  /** A lâmina do plano exato; é onde as etiquetas 3D se prendem. */
  readonly blade: THREE.Object3D;
  /**
   * Reposiciona a lâmina. Recebe as distâncias **físicas** em mm; o mapeamento
   * para a cena acontece aqui, com a mesma função que posiciona os objetos.
   */
  setZone(focusMm: number, nearMm: number, farMm: number): void;
  update(elapsed: number): void;
  setVisible(visible: boolean): void;
  /** Desliga a animação de varredura (prefers-reduced-motion). */
  setAnimated(animated: boolean): void;
  dispose(): void;
}

/** Altura e largura da lâmina, em unidades de cena. */
const SLAB = { height: 0.17, width: 0.54 };

/** Espessura mínima desenhada, para a lâmina não sumir em f/2. */
const MIN_THICKNESS = 0.004;

export function createFocusPlane(): FocusPlane {
  const group = new THREE.Group();
  group.name = 'focus-plane';

  // Volume da zona nítida: caixa translúcida aditiva.
  const zoneGeometry = new THREE.BoxGeometry(1, SLAB.height, SLAB.width);
  const zoneMaterial = new THREE.MeshBasicMaterial({
    color: PALETTE.focus,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const zone = new THREE.Mesh(zoneGeometry, zoneMaterial);
  group.add(zone);

  // A lâmina exata do plano de foco, com gradiente vertical e varredura.
  const bladeGeometry = new THREE.PlaneGeometry(SLAB.width, SLAB.height);
  bladeGeometry.rotateY(Math.PI / 2);

  const bladeMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(PALETTE.focus) },
      uTime: { value: 0 },
      uAnimated: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uAnimated;
      varying vec2 vUv;

      void main() {
        // Gradiente: forte embaixo, onde a lâmina toca o terreno.
        float vertical = pow(1.0 - vUv.y, 1.6);

        // Bordas brilhantes nas laterais da lâmina.
        float edge = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
        edge = 1.0 - edge;

        // Varredura suave subindo, só quando a animação está ligada.
        float scan = uAnimated * 0.35 * exp(-40.0 * abs(fract(vUv.y - uTime * 0.18) - 0.5));

        float alpha = vertical * 0.34 + edge * 0.5 + scan;
        gl_FragColor = vec4(uColor, alpha * 0.55);
      }
    `,
  });

  const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
  group.add(blade);

  let animated = true;

  return {
    group,
    blade,

    setZone(focusMm: number, nearMm: number, farMm: number): void {
      const focusX = distanceToSceneX(focusMm);
      const nearX = distanceToSceneX(nearMm);
      const farX = distanceToSceneX(farMm);

      blade.position.x = focusX;

      // A caixa vai do limite próximo ao distante, ambos já mapeados.
      const thickness = Math.max(Math.abs(nearX - farX), MIN_THICKNESS);
      zone.scale.x = thickness;
      zone.position.x = (nearX + farX) / 2;
    },

    update(elapsed: number): void {
      if (!animated) return;
      bladeMaterial.uniforms.uTime!.value = elapsed;
    },

    setVisible(visible: boolean): void {
      group.visible = visible;
    },

    setAnimated(value: boolean): void {
      animated = value;
      bladeMaterial.uniforms.uAnimated!.value = value ? 1 : 0;
    },

    dispose(): void {
      zoneGeometry.dispose();
      zoneMaterial.dispose();
      bladeGeometry.dispose();
      bladeMaterial.dispose();
      group.clear();
    },
  };
}

export interface IntersectionPatch {
  /** Atualiza a faixa acesa. Distâncias físicas em mm. */
  setZone(focusMm: number, nearMm: number, farMm: number): void;
  dispose(): void;
}

/**
 * Largura da linha de corte, em unidades de cena.
 *
 * É a **única** concessão de renderização desta fase, e vale declará-la: a
 * zona nítida em f/2 a 37 cm tem 6,8 mm de profundidade, o que no mapa
 * logarítmico dá 6 milésimos de unidade — fino demais para enxergar. A faixa
 * larga continua sendo a zona nítida real; por cima dela vai uma linha fina de
 * largura fixa marcando o plano de foco exato. A linha diz *onde*, a faixa diz
 * *quanto*.
 */
const CUT_LINE_HALF_WIDTH = 0.0022;

/**
 * Acende uma faixa emissiva nos materiais do diorama onde eles atravessam a
 * zona nítida (SPEC §6.5).
 *
 * Feito por `onBeforeCompile`: o material continua sendo o PBR normal, só
 * ganha um termo a mais no final do fragmento. O critério é a **posição de
 * mundo no eixo óptico**, comparada aos limites mapeados — o mesmo mapa que
 * põe os objetos no lugar. Por isso a faixa acende exatamente nos objetos que
 * a física diz estarem nítidos.
 */
export function attachIntersectionPatch(
  materials: readonly THREE.Material[],
  group: THREE.Object3D,
): IntersectionPatch {
  const uniforms = {
    uNearX: { value: 0 },
    uFarX: { value: 0 },
    uFocusX: { value: 0 },
    uSharpColor: { value: new THREE.Color(PALETTE.focus) },
    uOriginX: { value: 0 },
  };

  for (const material of materials) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uNearX = uniforms.uNearX;
      shader.uniforms.uFarX = uniforms.uFarX;
      shader.uniforms.uFocusX = uniforms.uFocusX;
      shader.uniforms.uSharpColor = uniforms.uSharpColor;
      shader.uniforms.uOriginX = uniforms.uOriginX;

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vOpticalX;')
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
           #ifdef USE_INSTANCING
             vec4 sharpWorld = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
           #else
             vec4 sharpWorld = modelMatrix * vec4(transformed, 1.0);
           #endif
           vOpticalX = sharpWorld.x;`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           varying float vOpticalX;
           uniform float uNearX;
           uniform float uFarX;
           uniform float uFocusX;
           uniform float uOriginX;
           uniform vec3 uSharpColor;`,
        )
        .replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
           {
             float local = vOpticalX - uOriginX;
             float lo = min(uNearX, uFarX);
             float hi = max(uNearX, uFarX);
             // Dentro da zona nítida acende; a transição acompanha a
             // espessura da própria zona, então em f/16 a faixa é larga
             // e suave, em f/2 é estreita e dura.
             float feather = max((hi - lo) * 0.18, 0.0012);
             float inside = smoothstep(lo - feather, lo + feather, local)
                          * (1.0 - smoothstep(hi - feather, hi + feather, local));

             // Linha fina no plano de foco exato: diz onde, com largura fixa.
             float cut = 1.0 - smoothstep(0.0, ${CUT_LINE_HALF_WIDTH.toFixed(5)}, abs(local - uFocusX));

             gl_FragColor.rgb += uSharpColor * (inside * 0.9 + cut * 1.6);
           }`,
        );
    };

    // Sem isto o patch não aparece. O three.js guarda programas compilados num
    // cache indexado pelas propriedades do material, e `onBeforeCompile` NÃO
    // entra nessa chave: um material da bancada com as mesmas flags gera a
    // mesma chave, e o terreno acaba reusando o programa dele, sem a faixa.
    material.customProgramCacheKey = () => 'lens-focus-sharp-zone';
    material.needsUpdate = true;
  }

  // A posição do grupo entra como origem: os materiais veem coordenadas de
  // mundo, e o mapa de profundidade é medido a partir da objetiva.
  const updateOrigin = (): void => {
    group.updateWorldMatrix(true, false);
    uniforms.uOriginX.value = group.getWorldPosition(new THREE.Vector3()).x;
  };

  return {
    setZone(focusMm: number, nearMm: number, farMm: number): void {
      updateOrigin();
      uniforms.uFocusX.value = distanceToSceneX(focusMm);
      uniforms.uNearX.value = distanceToSceneX(nearMm);
      uniforms.uFarX.value = distanceToSceneX(farMm);
    },
    dispose(): void {
      for (const material of materials) {
        material.onBeforeCompile = () => undefined;
        material.customProgramCacheKey = () => '';
        material.needsUpdate = true;
      }
    },
  };
}
