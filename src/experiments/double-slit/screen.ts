import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HardwareKit, groupGeometries, opticalPost, pose, screenBezel } from '../../scene/hardware';
import type { MaterialLibrary } from '../../scene/materials';

/**
 * Anteparo de fósforo (ADR 0009). Mostra duas camadas:
 *
 * - **o padrão**: a intensidade calculada pelo motor em cada x do anteparo,
 *   como numa exposição longa. É a distribuição de probabilidade de onde cada
 *   elétron cai;
 * - **os impactos**: cada elétron que chega acende um ponto que se apaga
 *   devagar. Com o tempo, os pontos desenham o mesmo padrão.
 *
 * A placa fica no plano x = 0 do grupo, de frente para as fendas (−x). A
 * largura muda com o tamanho do anteparo escolhido; a altura é fixa, porque as
 * fendas são longas e o padrão é de listras verticais.
 */

export interface PhosphorScreen {
  readonly group: THREE.Group;
  /** Intensidades de 0 a 1, de uma borda à outra do anteparo (−z para +z). */
  setPattern(values: ArrayLike<number>): void;
  setTint(hex: number): void;
  /** Largura do anteparo, em unidades de cena. */
  setWidth(width: number): void;
  /** Um impacto em (u, v), coordenadas de 0 a 1 na placa. */
  addHit(u: number, v: number): void;
  /** Mostra ou esconde a camada de impactos. */
  setHitsVisible(visible: boolean): void;
  /**
   * Uma tela extra com a mesma imagem do anteparo, vista de frente: é o
   * monitor da câmera que filma o fósforo. Voltada para +z.
   */
  createMonitorFace(width: number, height: number): THREE.Mesh;
  update(dt: number): void;
  dispose(): void;
}

export interface PhosphorScreenOptions {
  readonly materials: MaterialLibrary;
  readonly width: number;
  readonly height: number;
  /** Amostras do padrão ao longo da largura. */
  readonly samples: number;
  /** Altura do eixo do feixe acima do carrinho: dá o tamanho do pé. */
  readonly axisHeight: number;
}

const HITS = { w: 192, h: 96 };

export function createPhosphorScreen({
  materials,
  width,
  height,
  samples,
  axisHeight,
}: PhosphorScreenOptions): PhosphorScreen {
  const group = new THREE.Group();
  group.name = 'phosphor-screen';
  const geometries: THREE.BufferGeometry[] = [];

  const patternData = new Uint8Array(samples * 4);
  const patternTexture = new THREE.DataTexture(patternData, samples, 1, THREE.RGBAFormat);
  patternTexture.magFilter = THREE.LinearFilter;
  patternTexture.minFilter = THREE.LinearFilter;
  patternTexture.needsUpdate = true;

  const hitData = new Float32Array(HITS.w * HITS.h);
  const hitBytes = new Uint8Array(HITS.w * HITS.h * 4);
  const hitTexture = new THREE.DataTexture(hitBytes, HITS.w, HITS.h, THREE.RGBAFormat);
  hitTexture.magFilter = THREE.LinearFilter;
  hitTexture.minFilter = THREE.LinearFilter;
  hitTexture.needsUpdate = true;
  let hitsVisible = true;
  let hitsDirty = false;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      tPattern: { value: patternTexture },
      tHits: { value: hitTexture },
      uTint: { value: new THREE.Color(0x52ff8c) },
      uHits: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tPattern;
      uniform sampler2D tHits;
      uniform vec3 uTint;
      uniform float uHits;
      varying vec2 vUv;
      void main() {
        float pattern = texture2D(tPattern, vec2(vUv.x, 0.5)).r;
        float hits = texture2D(tHits, vUv).r * uHits;
        // Bordas da placa um pouco mais escuras, como o fósforo real perto
        // da moldura.
        float edge = smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
        vec3 base = vec3(0.025, 0.03, 0.035);
        vec3 glow = uTint * (pattern * 0.9 * edge + hits * 1.8);
        gl_FragColor = vec4(base + glow, 1.0);
      }
    `,
  });

  const planeGeometry = new THREE.PlaneGeometry(1, height);
  // A placa olha para −x (as fendas); u cresce de −z para +z.
  planeGeometry.rotateY(-Math.PI / 2);
  geometries.push(planeGeometry);
  const plane = new THREE.Mesh(planeGeometry, material);
  group.add(plane);

  // A face de trás da placa também mostra o padrão, para quem olha da frente
  // da bancada em ângulo: é um vidro de fósforo, translúcido à luz.
  const backGeometry = new THREE.PlaneGeometry(1, height);
  backGeometry.rotateY(Math.PI / 2);
  // Girada para +x, a face de trás teria u crescendo para −z e mostraria o
  // padrão espelhado. Invertido, cada franja fica no mesmo z dos dois lados.
  const backUv = backGeometry.attributes.uv!;
  for (let i = 0; i < backUv.count; i += 1) backUv.setX(i, 1 - backUv.getX(i));
  geometries.push(backGeometry);
  const back = new THREE.Mesh(backGeometry, material);
  back.position.x = 0.004;
  group.add(back);

  // Moldura: quatro barras numa malha só, refeita quando a largura muda.
  const frame = new THREE.Mesh(new THREE.BufferGeometry(), materials.anodizedAluminum);
  frame.castShadow = true;
  group.add(frame);
  // Poste óptico da borda de baixo da placa até o carrinho (o porta-poste
  // assenta no bloco do carrinho, 52 mm acima da origem dele).
  {
    const kit = new HardwareKit();
    const carriageTop = 0.052;
    const top = axisHeight - height / 2 - carriageTop;
    if (top > 0.02) {
      opticalPost(kit, pose(0.02, -axisHeight + carriageTop, 0), { top, base: false, holderHeight: Math.min(0.06, top * 0.5), postRadius: 0.0075 });
    }
    // Bloco de fixação na borda de baixo da moldura.
    kit.add('anodized', new RoundedBoxGeometry(0.04, 0.02, 0.07, 2, 0.005).translate(0.02, -height / 2 - 0.018 - 0.01, 0));
    const mount = kit.build(materials, 'phosphor-mount');
    geometries.push(...groupGeometries(mount));
    group.add(mount);
  }

  // Moldura arredondada, refeita quando a largura muda.
  const buildFrame = (w: number): void => {
    const bar = 0.018;
    const depth = 0.03;
    const kit = new HardwareKit();
    const facing = new THREE.Matrix4().makeRotationY(-Math.PI / 2);
    screenBezel(kit, facing.multiply(new THREE.Matrix4().makeTranslation(0, 0, -depth / 2 - 0.002)), {
      width: w,
      height,
      border: bar,
      depth,
      radius: bar * 0.9,
    });
    const merged = kit.merge().get('anodized');
    frame.geometry.dispose();
    if (merged) frame.geometry = merged;
    plane.scale.z = w;
    back.scale.z = w;
  };

  const setWidth = (w: number): void => buildFrame(w);
  setWidth(width);

  return {
    group,

    setPattern(values: ArrayLike<number>): void {
      for (let i = 0; i < samples; i += 1) {
        const v = Math.round(Math.min(Math.max(values[i] ?? 0, 0), 1) * 255);
        patternData[i * 4] = v;
        patternData[i * 4 + 1] = v;
        patternData[i * 4 + 2] = v;
        patternData[i * 4 + 3] = 255;
      }
      patternTexture.needsUpdate = true;
    },

    setTint(hex: number): void {
      (material.uniforms.uTint!.value as THREE.Color).setHex(hex);
    },

    setWidth,

    addHit(u: number, v: number): void {
      // Um pontinho de 2×2 texels, somado ao que já está aceso.
      const x = Math.floor(u * HITS.w);
      const y = Math.floor(v * HITS.h);
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          const px = x + dx;
          const py = y + dy;
          if (px < 0 || py < 0 || px >= HITS.w || py >= HITS.h) continue;
          const index = py * HITS.w + px;
          hitData[index] = Math.min(1, hitData[index]! + 0.9);
        }
      }
      hitsDirty = true;
    },

    setHitsVisible(visible: boolean): void {
      hitsVisible = visible;
      material.uniforms.uHits!.value = visible ? 1 : 0;
    },

    createMonitorFace(faceWidth: number, faceHeight: number): THREE.Mesh {
      const faceGeometry = new THREE.PlaneGeometry(faceWidth, faceHeight);
      geometries.push(faceGeometry);
      return new THREE.Mesh(faceGeometry, material);
    },

    update(dt: number): void {
      if (!hitsVisible) return;
      // Cada ponto se apaga em ~1,5 s, como o brilho residual do fósforo.
      const decay = Math.exp(-dt / 1.5);
      let any = hitsDirty;
      for (let i = 0; i < hitData.length; i += 1) {
        const value = hitData[i]!;
        if (value <= 0) continue;
        const next = value * decay;
        hitData[i] = next < 0.01 ? 0 : next;
        hitBytes[i * 4] = Math.round(hitData[i]! * 255);
        any = true;
      }
      if (any) hitTexture.needsUpdate = true;
      hitsDirty = false;
    },

    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      frame.geometry.dispose();
      material.dispose();
      patternTexture.dispose();
      hitTexture.dispose();
      group.clear();
    },
  };
}
