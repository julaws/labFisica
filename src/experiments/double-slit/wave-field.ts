import * as THREE from 'three';

/**
 * Onda depois das fendas (ADR 0009), num plano horizontal na altura do feixe,
 * entre a placa das fendas (x = 0) e o anteparo.
 *
 * O brilho é a intensidade média no tempo de duas ondas cilíndricas, uma por
 * fenda aberta, cada uma com o envelope de difração da própria fenda:
 *
 *     I = A₁² + A₂² + 2·A₁·A₂·cos(k·(r₁ − r₂)),   A = sinc(k·a·sen θ / 2).
 *
 * O comprimento de onda usado é o da geometria **desenhada**: com a ampliação
 * transversal M, as franjas no anteparo desenhado ficam em M·λL/d, e isso pede
 * λ_cena = M²·λ. Assim as linhas escuras que saem das fendas chegam ao
 * anteparo exatamente nas franjas escuras. Por cima, pulsos claros andando
 * para fora mostram que a onda se propaga; o espaçamento deles é só visual
 * (declarado no modal).
 *
 * Onde as franjas ficam mais finas que um pixel (perto das fendas), o termo de
 * interferência é atenuado pela derivada da fase, em vez de virar ruído.
 */

export interface WaveField {
  readonly mesh: THREE.Mesh;
  setGeometry(options: {
    length: number;
    halfWidth: number;
    slitZ: readonly [number, number];
    slitWidth: number;
    wavelength: number;
  }): void;
  setOpen(left: boolean, right: boolean): void;
  setTint(hex: number): void;
  setVisible(visible: boolean): void;
  update(elapsed: number): void;
  dispose(): void;
}

export function createWaveField(): WaveField {
  const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  // Deitado no plano xz, com x de 0 a 1 e z de −0,5 a 0,5 antes da escala.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0.5, 0, 0);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSlitZ: { value: new THREE.Vector2(-0.04, 0.04) },
      uOpen: { value: new THREE.Vector2(1, 1) },
      uK: { value: (2 * Math.PI) / 0.0005 },
      uSlitWidth: { value: 0.012 },
      uLength: { value: 1.4 },
      uTime: { value: 0 },
      uTint: { value: new THREE.Color(0x52ff8c) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        // Posição relativa à origem do campo (o meio da placa das fendas),
        // já com a escala. A bancada não gira, então os eixos são os da cena:
        // x ao longo do feixe, z transversal.
        vLocal = world.xyz - (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec2 uSlitZ;
      uniform vec2 uOpen;
      uniform float uK;
      uniform float uSlitWidth;
      uniform float uLength;
      uniform float uTime;
      uniform vec3 uTint;
      varying vec3 vLocal;

      float sinc(float x) {
        return abs(x) < 1e-4 ? 1.0 : sin(x) / x;
      }

      void main() {
        float x = max(vLocal.x, 1e-4);
        float z = vLocal.z;
        float r1 = length(vec2(x, z - uSlitZ.x));
        float r2 = length(vec2(x, z - uSlitZ.y));
        float a1 = uOpen.x * sinc(0.5 * uK * uSlitWidth * (z - uSlitZ.x) / r1);
        float a2 = uOpen.y * sinc(0.5 * uK * uSlitWidth * (z - uSlitZ.y) / r2);

        float phase = uK * (r1 - r2);
        // Antisserrilhado: se a fase muda mais de π por pixel, as franjas
        // não cabem na tela e o termo de interferência some (fica a média).
        float contrast = clamp(1.0 - fwidth(phase) / 3.14159, 0.0, 1.0);
        float intensity = a1 * a1 + a2 * a2 + 2.0 * a1 * a2 * cos(phase) * contrast;

        // Pulsos andando para fora das fendas: só para mostrar a propagação.
        float r = 0.5 * (r1 + r2);
        float pulse = 0.78 + 0.22 * sin(6.2831853 * (r - uTime * 0.18) / 0.07);

        // Entra suave depois da placa e some antes do anteparo.
        float fade = smoothstep(0.0, 0.06, x) * (1.0 - smoothstep(uLength - 0.05, uLength, x));
        float alpha = clamp(intensity * 0.5 * pulse * fade, 0.0, 1.0);
        gl_FragColor = vec4(uTint * alpha, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'wave-field';
  mesh.frustumCulled = false;

  const uniforms = material.uniforms;

  return {
    mesh,
    setGeometry({ length, halfWidth, slitZ, slitWidth, wavelength }): void {
      mesh.scale.set(length, 1, halfWidth * 2);
      uniforms.uLength!.value = length;
      (uniforms.uSlitZ!.value as THREE.Vector2).set(slitZ[0], slitZ[1]);
      uniforms.uSlitWidth!.value = slitWidth;
      uniforms.uK!.value = (2 * Math.PI) / wavelength;
    },
    setOpen(left: boolean, right: boolean): void {
      (uniforms.uOpen!.value as THREE.Vector2).set(left ? 1 : 0, right ? 1 : 0);
    },
    setTint(hex: number): void {
      (uniforms.uTint!.value as THREE.Color).setHex(hex);
    },
    setVisible(visible: boolean): void {
      mesh.visible = visible;
    },
    update(elapsed: number): void {
      uniforms.uTime!.value = elapsed;
    },
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
