import * as THREE from 'three';
import type { BarrierWave } from '../../optics/quantum/tunneling';
import { SCENE_PER_NM, WAVE_FROM, WAVE_HEIGHT, WAVE_TO } from './layout';

/**
 * A onda do elétron sobre o feixe (ADR 0011), calculada **na placa de vídeo**
 * a partir da solução exata do motor (`barrierWave`): só os coeficientes r, C,
 * D e τ mudam quando a barreira muda; a geometria é fixa.
 *
 *     antes:   ψ = e^{ikx} + r·e^{−ikx}       (onda que chega + refletida)
 *     dentro:  ψ = C·e^{−κx} + D·e^{κx}        (decai; ou oscila, se E > V₀)
 *     depois:  ψ = τ·e^{ik(x − a)}             (a parte que tunelou)
 *
 * Duas camadas, na altura da energia do elétron:
 * - o **envelope** |ψ|, uma cortina translúcida (amplitude, não |ψ|²: com
 *   |ψ|² a parte que tunela some de vista; a escala está no modal);
 * - **Re ψ**, uma linha que ondula no tempo, como uma corda.
 *
 * O `position` da geometria é zero de propósito: passagens do
 * pós-processamento com material substituto o desenham como estiver, e só
 * assim não custam nada (ver ADR 0010).
 */

export interface ElectronWave {
  readonly group: THREE.Group;
  readonly glowing: THREE.Object3D[];
  setWave(wave: BarrierWave): void;
  /** Altura do eixo da onda: a energia do elétron, m de cena. */
  setBaseline(y: number): void;
  setVisible(visible: boolean): void;
  update(elapsed: number): void;
  dispose(): void;
}

const SEGMENTS = 480;

const WAVE_GLSL = /* glsl */ `
  uniform float uK;       // 1/nm
  uniform float uInside;  // κ (1/nm) se uMode = 0; K (1/nm) se uMode = 1
  uniform float uMode;
  uniform float uWidth;   // nm
  uniform vec2 uR;
  uniform vec2 uC;
  uniform vec2 uD;
  uniform vec2 uTau;
  uniform float uPerNm;
  uniform float uBaseline;
  uniform float uHeight;
  uniform float uPhase;
  vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
  vec2 cis(float t) { return vec2(cos(t), sin(t)); }
  vec2 psi(float x) {
    if (x < 0.0) return cis(uK * x) + cmul(uR, cis(-uK * x));
    if (x <= uWidth) {
      if (uMode < 0.5) return uC * exp(-uInside * x) + uD * exp(uInside * x);
      return cmul(uC, cis(uInside * x)) + cmul(uD, cis(-uInside * x));
    }
    return cmul(uTau, cis(uK * (x - uWidth)));
  }
`;

export function createElectronWave(): ElectronWave {
  const group = new THREE.Group();
  group.name = 'electron-wave';

  const uniforms = {
    uK: { value: 5.1 },
    uInside: { value: 5.1 },
    uMode: { value: 0 },
    uWidth: { value: 0.4 },
    uR: { value: new THREE.Vector2() },
    uC: { value: new THREE.Vector2() },
    uD: { value: new THREE.Vector2() },
    uTau: { value: new THREE.Vector2() },
    uPerNm: { value: SCENE_PER_NM },
    uBaseline: { value: 0.12 },
    uHeight: { value: WAVE_HEIGHT },
    uPhase: { value: 0 },
  };

  // Faixa de SEGMENTS colunas por 2 linhas: x vai em aX, a linha em aRow.
  const strip = (): THREE.BufferGeometry => {
    const geometry = new THREE.BufferGeometry();
    const count = (SEGMENTS + 1) * 2;
    const xs = new Float32Array(count);
    const rows = new Float32Array(count);
    const indices: number[] = [];
    for (let i = 0; i <= SEGMENTS; i += 1) {
      const x = WAVE_FROM + ((WAVE_TO - WAVE_FROM) * i) / SEGMENTS;
      xs[i * 2] = x;
      xs[i * 2 + 1] = x;
      rows[i * 2] = 0;
      rows[i * 2 + 1] = 1;
      if (i < SEGMENTS) {
        const a = i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('aX', new THREE.BufferAttribute(xs, 1));
    geometry.setAttribute('aRow', new THREE.BufferAttribute(rows, 1));
    geometry.setIndex(indices);
    return geometry;
  };

  // --- Envelope |ψ| -------------------------------------------------------------
  const envelopeGeometry = strip();
  const envelopeMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float aX;
      attribute float aRow;
      varying float vRow;
      varying float vInside;
      ${WAVE_GLSL}
      void main() {
        float x = aX / uPerNm;
        float amplitude = length(psi(x));
        vec3 p = vec3(aX, uBaseline + aRow * amplitude * uHeight, -0.004);
        vRow = aRow;
        vInside = step(0.0, x) * step(x, uWidth);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vRow;
      varying float vInside;
      void main() {
        vec3 color = mix(vec3(0.3, 0.85, 1.0), vec3(0.78, 0.55, 1.0), vInside);
        float alpha = 0.08 + 0.32 * vRow * vRow;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const envelope = new THREE.Mesh(envelopeGeometry, envelopeMaterial);
  envelope.frustumCulled = false;
  group.add(envelope);

  // --- Re ψ, a "corda" que ondula -----------------------------------------------
  const lineGeometry = strip();
  const lineMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float aX;
      attribute float aRow;
      varying float vInside;
      ${WAVE_GLSL}
      void main() {
        float x = aX / uPerNm;
        // ψ(x)·e^{−iωt}: a parte real ondula no tempo.
        float value = cmul(psi(x), cis(-uPhase)).x;
        vec3 p = vec3(aX, uBaseline + value * uHeight + (aRow - 0.5) * 0.006, 0.0);
        vInside = step(0.0, x) * step(x, uWidth);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vInside;
      void main() {
        vec3 color = mix(vec3(0.55, 0.95, 1.0), vec3(0.9, 0.7, 1.0), vInside);
        gl_FragColor = vec4(color * 1.4, 1.0);
      }
    `,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const line = new THREE.Mesh(lineGeometry, lineMaterial);
  line.frustumCulled = false;
  group.add(line);

  return {
    group,
    glowing: [line],

    setWave(wave: BarrierWave): void {
      const perNm = 1e-9;
      uniforms.uK.value = wave.k * perNm;
      // Abaixo da barreira K = iκ: passa κ e o modo de decaimento.
      const decaying = Math.abs(wave.K.re) < 1e-3 * wave.k;
      uniforms.uMode.value = decaying ? 0 : 1;
      uniforms.uInside.value = (decaying ? wave.K.im : wave.K.re) * perNm;
      uniforms.uWidth.value = wave.width / perNm;
      uniforms.uR.value.set(wave.r.re, wave.r.im);
      uniforms.uC.value.set(wave.C.re, wave.C.im);
      uniforms.uD.value.set(wave.D.re, wave.D.im);
      uniforms.uTau.value.set(wave.tau.re, wave.tau.im);
    },

    setBaseline(y: number): void {
      uniforms.uBaseline.value = y;
    },

    setVisible(visible: boolean): void {
      group.visible = visible;
    },

    update(elapsed: number): void {
      // Uma oscilação a cada 1,6 s: o ritmo é visual (a real é de 10¹⁴ Hz).
      uniforms.uPhase.value = (elapsed * Math.PI * 2) / 1.6;
    },

    dispose(): void {
      envelopeGeometry.dispose();
      lineGeometry.dispose();
      envelopeMaterial.dispose();
      lineMaterial.dispose();
      group.clear();
    },
  };
}
