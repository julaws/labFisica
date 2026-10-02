import * as THREE from 'three';
import type { SlitSide } from './slit-plate';

/**
 * Feixe de elétrons (ADR 0009), um elétron por vez.
 *
 * Cada elétron sai do bocal do canhão mirando uma das fendas, numa folha
 * vertical (as fendas são longas, e o padrão sai em listras). Na placa:
 *
 * - se a fenda mirada está tampada, ele para ali;
 * - com os detectores ligados, o detector daquela fenda pisca, e o elétron
 *   segue em linha reta até um ponto sorteado no padrão **daquela fenda**;
 * - com os detectores desligados, não há caminho para desenhar: o elétron
 *   some na placa, a onda segue pelas duas fendas, e um impacto aparece no
 *   anteparo, sorteado no padrão de interferência.
 *
 * O sorteio vem do experimento (`land`), que conhece o padrão calculado. A
 * velocidade desenhada é visual: o elétron real a 50 kV anda a 41% da luz.
 */

export interface BeamDecision {
  /** Onde o elétron cai no anteparo, em z de cena; NaN se não chega. */
  readonly landingZ: number;
}

export interface ElectronBeam {
  /** Elétrons e o halo do feixe; os dois vão para o bloom. */
  readonly group: THREE.Group;
  readonly glowing: THREE.Object3D[];
  setGeometry(options: { gunX: number; screenX: number }): void;
  setTint(hex: number): void;
  setVisible(visible: boolean): void;
  update(dt: number): void;
  dispose(): void;
}

export interface ElectronBeamOptions {
  /** z de cada fenda e meia altura delas, em unidades de cena. */
  readonly slitZ: Record<SlitSide, number>;
  readonly slitHalfHeight: number;
  /** Largura de cada fenda, em unidades de cena. */
  readonly slitWidth: number;
  /** Estado atual das fendas e dos detectores. */
  readonly state: () => { left: boolean; right: boolean; detectors: boolean };
  /** Sorteia o ponto de chegada: no padrão de uma fenda, ou no de interferência. */
  readonly land: (via: SlitSide | 'both') => number;
  readonly onDetect: (side: SlitSide) => void;
  readonly onHit: (z: number, y: number) => void;
}

const CAPACITY = 220;
/** Elétrons por segundo desenhados. */
const RATE = 36;
/** Velocidade desenhada, unidades de cena por segundo. */
const SPEED = 1.6;

type Phase = 'idle' | 'toSlit' | 'toScreen' | 'wave';

export function createElectronBeam(options: ElectronBeamOptions): ElectronBeam {
  const positions = new Float32Array(CAPACITY * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  // Pontinho redondo de borda suave: sem textura, o PointsMaterial desenha
  // quadrados.
  const DOT = 32;
  const dotPixels = new Uint8Array(DOT * DOT * 4);
  for (let y = 0; y < DOT; y += 1) {
    for (let x = 0; x < DOT; x += 1) {
      const r = Math.hypot(x + 0.5 - DOT / 2, y + 0.5 - DOT / 2) / (DOT / 2);
      const value = Math.round(Math.max(0, 1 - r) ** 1.6 * 255);
      dotPixels.set([255, 255, 255, value], (y * DOT + x) * 4);
    }
  }
  const dotTexture = new THREE.DataTexture(dotPixels, DOT, DOT, THREE.RGBAFormat);
  dotTexture.magFilter = THREE.LinearFilter;
  dotTexture.minFilter = THREE.LinearFilter;
  dotTexture.needsUpdate = true;

  const material = new THREE.PointsMaterial({
    map: dotTexture,
    size: 0.022,
    sizeAttenuation: true,
    color: 0x52ff8c,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'electron-beam';
  points.frustumCulled = false;

  // Halo do feixe entre o bocal e a placa: dois trapézios cruzados (um em pé,
  // um deitado), mais claros no eixo. Um elétron por vez não desenha um feixe;
  // o halo mostra para onde o canhão aponta.
  const sheathGeometry = new THREE.BufferGeometry();
  const sheathMaterial = new THREE.ShaderMaterial({
    uniforms: { uTint: { value: new THREE.Color(0x52ff8c) } },
    vertexShader: /* glsl */ `
      attribute vec2 aBeam;
      varying vec2 vBeam;
      void main() {
        vBeam = aBeam;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint;
      varying vec2 vBeam;
      void main() {
        // x: 0 no bocal, 1 na placa; y: −1 a 1 de uma borda à outra.
        float across = 1.0 - vBeam.y * vBeam.y;
        float alpha = across * across * mix(0.5, 0.2, vBeam.x) * smoothstep(0.0, 0.05, vBeam.x);
        // A mistura aditiva do three já multiplica a cor pelo alfa.
        gl_FragColor = vec4(uTint, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const sheath = new THREE.Mesh(sheathGeometry, sheathMaterial);
  sheath.name = 'electron-beam-halo';
  sheath.frustumCulled = false;

  const buildSheath = (): void => {
    const nozzle = 0.008;
    const halfZ = Math.max(Math.abs(options.slitZ.left), Math.abs(options.slitZ.right)) + options.slitWidth * 2;
    const halfY = options.slitHalfHeight;
    // Dois quads: [x, y, z] e o atributo (ao longo, através).
    const vertices = [
      // Em pé (plano xy).
      gunX, -nozzle, 0, 0, halfY, 0, 0, -halfY, 0, gunX, nozzle, 0,
      // Deitado (plano xz).
      gunX, 0, -nozzle, 0, 0, halfZ, 0, 0, -halfZ, gunX, 0, nozzle,
    ];
    const beam = [0, -1, 1, 1, 1, -1, 0, 1, 0, -1, 1, 1, 1, -1, 0, 1];
    sheathGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    sheathGeometry.setAttribute('aBeam', new THREE.Float32BufferAttribute(beam, 2));
    sheathGeometry.setIndex([0, 1, 2, 0, 3, 1, 4, 5, 6, 4, 7, 5]);
  };

  const group = new THREE.Group();
  group.name = 'electron-beam';
  group.add(sheath, points);

  const phase: Phase[] = new Array<Phase>(CAPACITY).fill('idle');
  const from = Array.from({ length: CAPACITY }, () => new THREE.Vector3());
  const to = Array.from({ length: CAPACITY }, () => new THREE.Vector3());
  const t = new Float32Array(CAPACITY);
  const duration = new Float32Array(CAPACITY);
  const aimSide: SlitSide[] = new Array<SlitSide>(CAPACITY).fill('left');

  let gunX = -0.6;
  let screenX = 1.4;
  let visible = true;
  let accumulator = 0;

  const hide = (i: number): void => {
    positions[i * 3] = 0;
    positions[i * 3 + 1] = -1000;
    positions[i * 3 + 2] = 0;
  };
  for (let i = 0; i < CAPACITY; i += 1) hide(i);
  buildSheath();

  const emit = (): void => {
    const i = phase.indexOf('idle');
    if (i < 0) return;
    const side: SlitSide = Math.random() < 0.5 ? 'left' : 'right';
    aimSide[i] = side;
    const y = (Math.random() * 2 - 1) * options.slitHalfHeight * 0.92;
    const z = options.slitZ[side] + (Math.random() - 0.5) * options.slitWidth * 0.8;
    from[i]!.set(gunX, 0, 0);
    to[i]!.set(0, y, z);
    t[i] = 0;
    duration[i] = from[i]!.distanceTo(to[i]!) / SPEED;
    phase[i] = 'toSlit';
  };

  const arriveAtSlits = (i: number): void => {
    const side = aimSide[i]!;
    const state = options.state();
    const open = side === 'left' ? state.left : state.right;
    if (!open) {
      // Bateu na tampa: fica por ali.
      phase[i] = 'idle';
      hide(i);
      return;
    }
    const y = to[i]!.y;
    if (state.detectors) {
      options.onDetect(side);
      const landing = options.land(side);
      if (Number.isNaN(landing)) {
        phase[i] = 'idle';
        hide(i);
        return;
      }
      from[i]!.copy(to[i]!);
      to[i]!.set(screenX, y, landing);
      t[i] = 0;
      duration[i] = from[i]!.distanceTo(to[i]!) / SPEED;
      phase[i] = 'toScreen';
      return;
    }
    // Sem detector: vira onda. O impacto chega quando a onda alcança o anteparo.
    const landing = options.land('both');
    from[i]!.set(screenX, y, landing);
    t[i] = 0;
    duration[i] = screenX / SPEED;
    phase[i] = Number.isNaN(landing) ? 'idle' : 'wave';
    hide(i);
  };

  return {
    group,
    glowing: [points, sheath],

    setGeometry(next): void {
      const moved = next.gunX !== gunX;
      gunX = next.gunX;
      screenX = next.screenX;
      if (moved) buildSheath();
    },

    setTint(hex: number): void {
      material.color.setHex(hex);
      (sheathMaterial.uniforms.uTint!.value as THREE.Color).setHex(hex);
    },

    setVisible(next: boolean): void {
      visible = next;
      group.visible = next;
      if (!next) {
        phase.fill('idle');
        for (let i = 0; i < CAPACITY; i += 1) hide(i);
      }
    },

    update(dt: number): void {
      if (!visible) return;
      accumulator += dt * RATE;
      while (accumulator >= 1) {
        emit();
        accumulator -= 1;
      }

      for (let i = 0; i < CAPACITY; i += 1) {
        const p = phase[i]!;
        if (p === 'idle') continue;
        t[i]! += dt;
        const progress = Math.min(t[i]! / duration[i]!, 1);

        if (p === 'wave') {
          if (progress >= 1) {
            options.onHit(from[i]!.z, from[i]!.y);
            phase[i] = 'idle';
          }
          continue;
        }

        const a = from[i]!;
        const b = to[i]!;
        positions[i * 3] = a.x + (b.x - a.x) * progress;
        positions[i * 3 + 1] = a.y + (b.y - a.y) * progress;
        positions[i * 3 + 2] = a.z + (b.z - a.z) * progress;

        if (progress >= 1) {
          if (p === 'toSlit') arriveAtSlits(i);
          else {
            options.onHit(b.z, b.y);
            phase[i] = 'idle';
            hide(i);
          }
        }
      }
      geometry.attributes.position!.needsUpdate = true;
    },

    dispose(): void {
      geometry.dispose();
      material.dispose();
      dotTexture.dispose();
      sheathGeometry.dispose();
      sheathMaterial.dispose();
    },
  };
}
