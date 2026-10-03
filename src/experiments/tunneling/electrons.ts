import * as THREE from 'three';
import { COLLECTOR_X, NOZZLE_X } from './layout';

/**
 * Os elétrons do feixe, um a um (ADR 0011).
 *
 * Cada elétron sai do canhão na altura da sua energia e corre até o muro. Ali
 * ele "sorteia" o destino com a probabilidade exata do motor:
 *
 * - **reflete** (probabilidade 1 − T): volta e se apaga;
 * - **tunela** (probabilidade T): atravessa o muro como um fantasma — o
 *   brilho cai dentro dele, como a amplitude da onda — e reaparece do outro
 *   lado com um clarão dourado, seguindo até o coletor.
 *
 * O fantasma é a imagem da onda decaindo; a partícula não "gasta" energia lá
 * dentro. As velocidades são visuais (um elétron de 1 eV anda a 600 km/s).
 */

export type Fate = 'tunneled' | 'reflected';

export interface ElectronStream {
  readonly points: THREE.Points;
  setBaseline(y: number): void;
  /** Espessura do muro, m de cena. */
  setBarrierWidth(width: number): void;
  /** Probabilidade de atravessar. */
  setTransmission(probability: number): void;
  /** Elétrons por segundo desenhados. */
  setRate(rate: number): void;
  update(dt: number): void;
  dispose(): void;
}

export interface ElectronStreamOptions {
  readonly onArrive: (fate: Fate) => void;
}

const CAPACITY = 160;
const SPEED = 0.55;
type Phase = 'idle' | 'approach' | 'inside' | 'out' | 'back';

const CYAN = new THREE.Color(0x8ee8ff);
const GHOST = new THREE.Color(0xb48cff);
const GOLD = new THREE.Color(0xffd36b);

export function createElectronStream({ onArrive }: ElectronStreamOptions): ElectronStream {
  const positions = new Float32Array(CAPACITY * 3);
  const colors = new Float32Array(CAPACITY * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // Ponto redondo de borda suave.
  const DOT = 32;
  const pixels = new Uint8Array(DOT * DOT * 4);
  for (let y = 0; y < DOT; y += 1) {
    for (let x = 0; x < DOT; x += 1) {
      const r = Math.hypot(x + 0.5 - DOT / 2, y + 0.5 - DOT / 2) / (DOT / 2);
      pixels.set([255, 255, 255, Math.round(Math.max(0, 1 - r) ** 1.4 * 255)], (y * DOT + x) * 4);
    }
  }
  const dot = new THREE.DataTexture(pixels, DOT, DOT, THREE.RGBAFormat);
  dot.magFilter = THREE.LinearFilter;
  dot.minFilter = THREE.LinearFilter;
  dot.needsUpdate = true;

  const material = new THREE.PointsMaterial({
    map: dot,
    size: 0.065,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'tunneling-electrons';
  points.frustumCulled = false;

  const phase = new Array<Phase>(CAPACITY).fill('idle');
  const x = new Float32Array(CAPACITY);
  const jitterY = new Float32Array(CAPACITY);
  const jitterZ = new Float32Array(CAPACITY);
  const flash = new Float32Array(CAPACITY);
  let baseline = 0.12;
  let barrierWidth = 0.16;
  let probability = 0.06;
  let rate = 10;
  let accumulator = 0;
  const color = new THREE.Color();

  const hide = (i: number): void => {
    positions[i * 3 + 1] = -1000;
  };
  for (let i = 0; i < CAPACITY; i += 1) hide(i);

  const emit = (): void => {
    const i = phase.indexOf('idle');
    if (i < 0) return;
    phase[i] = 'approach';
    x[i] = NOZZLE_X;
    jitterY[i] = (Math.random() - 0.5) * 0.012;
    jitterZ[i] = (Math.random() - 0.5) * 0.05;
    flash[i] = 0;
  };

  return {
    points,

    setBaseline(y: number): void {
      baseline = y;
    },
    setBarrierWidth(width: number): void {
      barrierWidth = width;
    },
    setTransmission(value: number): void {
      probability = value;
    },
    setRate(value: number): void {
      rate = value;
    },

    update(dt: number): void {
      accumulator += dt * rate;
      while (accumulator >= 1) {
        emit();
        accumulator -= 1;
      }
      const step = SPEED * Math.min(dt, 0.1);
      for (let i = 0; i < CAPACITY; i += 1) {
        const p = phase[i]!;
        if (p === 'idle') continue;
        let brightness = 1;
        let tint = CYAN;
        if (p === 'approach') {
          x[i]! += step;
          if (x[i]! >= 0) {
            // Chegou ao muro: tunela com a probabilidade exata, ou reflete.
            if (Math.random() < probability) phase[i] = 'inside';
            else {
              phase[i] = 'back';
              x[i] = 0;
            }
          }
        } else if (p === 'inside') {
          x[i]! += step * 0.7;
          const s = Math.min(x[i]! / Math.max(barrierWidth, 1e-3), 1);
          // O fantasma se apaga dentro do muro, como a amplitude da onda.
          brightness = 0.85 * Math.exp(-2.2 * s) + 0.08;
          tint = GHOST;
          if (x[i]! >= barrierWidth) {
            phase[i] = 'out';
            flash[i] = 1;
          }
        } else if (p === 'out') {
          x[i]! += step;
          flash[i] = Math.max(0, flash[i]! - dt * 1.5);
          if (x[i]! >= COLLECTOR_X) {
            phase[i] = 'idle';
            hide(i);
            onArrive('tunneled');
            continue;
          }
        } else {
          x[i]! -= step;
          brightness = Math.max(0, 1 + x[i]! / 0.6);
          if (brightness <= 0.02 || x[i]! <= NOZZLE_X) {
            phase[i] = 'idle';
            hide(i);
            onArrive('reflected');
            continue;
          }
        }
        color.copy(tint).lerp(GOLD, flash[i]!).multiplyScalar(brightness * (1.6 + flash[i]! * 2));
        positions[i * 3] = x[i]!;
        positions[i * 3 + 1] = baseline + jitterY[i]!;
        positions[i * 3 + 2] = jitterZ[i]!;
        colors.set([color.r, color.g, color.b], i * 3);
      }
      geometry.attributes.position!.needsUpdate = true;
      geometry.attributes.color!.needsUpdate = true;
    },

    dispose(): void {
      geometry.dispose();
      material.dispose();
      dot.dispose();
    },
  };
}
