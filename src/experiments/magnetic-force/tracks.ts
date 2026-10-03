import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

/**
 * Rastros luminosos dos elétrons (ADR 0010), como numa câmara de bolhas ou no
 * gás de um tubo de feixe fino.
 *
 * - Cada conjunto de trajetórias calculado vira um **instantâneo**. O atual
 *   brilha fixo; quando o campo muda, o anterior esmaece em ~1 s. Arrastar um
 *   slider deixa um leque de arcos se apagando — o "desenho" do campo.
 * - Tudo num único `LineSegments2` (um draw call). O esmaecimento vem de um
 *   atributo por segmento, a hora em que ele deixou de ser o atual, lido no
 *   shader. O buffer só é reescrito quando entra um instantâneo ou um antigo
 *   termina de apagar, e só guarda os vivos: parado, desenha só o atual.
 * - Pontos claros percorrem as trajetórias atuais: são os elétrons.
 */

export interface TrackPath {
  /** Pontos xyz em sequência, no referencial do grupo. */
  readonly points: Float32Array;
  readonly color: THREE.Color;
  /** Brilho de 0 a 1 (elétrons barrados no seletor saem mais fracos). */
  readonly intensity: number;
  /** Velocidade desenhada dos pontos, m/s de cena. */
  readonly speed: number;
}

export interface ElectronTracks {
  readonly group: THREE.Group;
  readonly glowing: THREE.Object3D[];
  /** Troca as trajetórias atuais; as anteriores esmaecem. */
  push(paths: readonly TrackPath[], now: number): void;
  setResolution(width: number, height: number): void;
  update(dt: number, now: number): void;
  dispose(): void;
}

/** Segmentos no buffer, somando o atual e os que ainda esmaecem. */
const TOTAL = 40000;
/** Tempo de esmaecimento de um rastro antigo, s. */
const FADE = 0.45;
const PULSES_PER_PATH = 3;
const MAX_PULSES = 16 * PULSES_PER_PATH;
/** Ainda vivo: `death` maior que qualquer tempo de relógio. */
const ALIVE = 1e9;
/** Depois disso um rastro antigo já não aparece e sai do buffer, s. */
const GONE = FADE * 7;

interface Snapshot {
  /** xyz, xyz por segmento. */
  readonly positions: Float32Array;
  readonly colors: Float32Array;
  readonly count: number;
  death: number;
}

export function createElectronTracks(): ElectronTracks {
  const group = new THREE.Group();
  group.name = 'electron-tracks';

  // --- Linhas ------------------------------------------------------------------
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(new Float32Array(TOTAL * 6));
  geometry.setColors(new Float32Array(TOTAL * 6));
  const death = new Float32Array(TOTAL).fill(-ALIVE);
  const deathAttribute = new THREE.InstancedBufferAttribute(death, 1);
  geometry.setAttribute('instanceDeath', deathAttribute);
  const positionBuffer = (geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute).data;
  const colorBuffer = (geometry.attributes.instanceColorStart as THREE.InterleavedBufferAttribute).data;
  const positions = positionBuffer.array as Float32Array;
  const colors = colorBuffer.array as Float32Array;

  const time = { value: 0 };
  const material = new LineMaterial({
    linewidth: 2.4,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  material.onBeforeCompile = (shader): void => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute float instanceDeath;\nuniform float uTime;\nvoid main() {')
      .replace(
        'vColor.xyz = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;',
        `vColor.xyz = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;
        vColor.xyz *= instanceDeath > uTime ? 1.0 : exp( -( uTime - instanceDeath ) / ${FADE.toFixed(2)} );`,
      );
  };
  material.customProgramCacheKey = (): string => 'electron-tracks-v1';

  const lines = new LineSegments2(geometry, material);
  lines.frustumCulled = false;
  lines.name = 'electron-track-lines';
  group.add(lines);

  // --- Elétrons: pontos que andam pelas trajetórias ----------------------------
  const DOT = 32;
  const dotPixels = new Uint8Array(DOT * DOT * 4);
  for (let y = 0; y < DOT; y += 1) {
    for (let x = 0; x < DOT; x += 1) {
      const r = Math.hypot(x + 0.5 - DOT / 2, y + 0.5 - DOT / 2) / (DOT / 2);
      dotPixels.set([255, 255, 255, Math.round(Math.max(0, 1 - r) ** 1.5 * 255)], (y * DOT + x) * 4);
    }
  }
  const dotTexture = new THREE.DataTexture(dotPixels, DOT, DOT, THREE.RGBAFormat);
  dotTexture.magFilter = THREE.LinearFilter;
  dotTexture.minFilter = THREE.LinearFilter;
  dotTexture.needsUpdate = true;

  const pulsePositions = new Float32Array(MAX_PULSES * 3).fill(-1000);
  const pulseColors = new Float32Array(MAX_PULSES * 3);
  const pulseGeometry = new THREE.BufferGeometry();
  pulseGeometry.setAttribute('position', new THREE.BufferAttribute(pulsePositions, 3));
  pulseGeometry.setAttribute('color', new THREE.BufferAttribute(pulseColors, 3));
  const pulseMaterial = new THREE.PointsMaterial({
    map: dotTexture,
    size: 0.022,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const pulses = new THREE.Points(pulseGeometry, pulseMaterial);
  pulses.frustumCulled = false;
  pulses.name = 'electron-pulses';
  group.add(pulses);

  /** Trajetórias atuais, com o comprimento acumulado de cada ponto. */
  let current: { points: Float32Array; cumulative: Float32Array; speed: number; color: THREE.Color }[] = [];
  let snapshots: Snapshot[] = [];
  let clock = 0;

  /** Reescreve o buffer com os instantâneos vivos, o atual por último. */
  const rebuild = (): void => {
    let offset = 0;
    for (const snapshot of snapshots) {
      const count = Math.min(snapshot.count, TOTAL - offset);
      if (count <= 0) break;
      positions.set(snapshot.positions.subarray(0, count * 6), offset * 6);
      colors.set(snapshot.colors.subarray(0, count * 6), offset * 6);
      death.fill(snapshot.death, offset, offset + count);
      offset += count;
    }
    geometry.instanceCount = offset;
    if (offset === 0) return;
    // Só o trecho usado sobe para a GPU.
    positionBuffer.clearUpdateRanges();
    positionBuffer.addUpdateRange(0, offset * 6);
    colorBuffer.clearUpdateRanges();
    colorBuffer.addUpdateRange(0, offset * 6);
    deathAttribute.clearUpdateRanges();
    deathAttribute.addUpdateRange(0, offset);
    positionBuffer.needsUpdate = true;
    colorBuffer.needsUpdate = true;
    deathAttribute.needsUpdate = true;
  };

  return {
    group,
    glowing: [lines, pulses],

    push(paths, now): void {
      for (const snapshot of snapshots) if (snapshot.death >= ALIVE) snapshot.death = now;
      // O atual vai primeiro na conta de espaço: os antigos cedem lugar.
      let count = 0;
      for (const path of paths) count += Math.max(0, path.points.length / 3 - 1);
      count = Math.min(count, TOTAL);
      const positionsOut = new Float32Array(count * 6);
      const colorsOut = new Float32Array(count * 6);
      let segment = 0;
      for (const path of paths) {
        const p = path.points;
        const r = path.color.r * path.intensity;
        const g = path.color.g * path.intensity;
        const b = path.color.b * path.intensity;
        for (let i = 0; i + 5 < p.length && segment < count; i += 3) {
          positionsOut.set([p[i]!, p[i + 1]!, p[i + 2]!, p[i + 3]!, p[i + 4]!, p[i + 5]!], segment * 6);
          colorsOut.set([r, g, b, r, g, b], segment * 6);
          segment += 1;
        }
      }
      const fresh: Snapshot = { positions: positionsOut, colors: colorsOut, count: segment, death: ALIVE };
      // Os mais recentes primeiro; o que não couber dos antigos fica de fora.
      let room = TOTAL - fresh.count;
      const kept: Snapshot[] = [];
      for (const snapshot of [...snapshots].reverse()) {
        if (now - snapshot.death > GONE || room <= 0) continue;
        kept.unshift(snapshot);
        room -= snapshot.count;
      }
      snapshots = [...kept, fresh];
      rebuild();

      current = paths
        .filter((path) => path.intensity > 0.6)
        .slice(0, MAX_PULSES / PULSES_PER_PATH)
        .map((path) => {
          const p = path.points;
          const cumulative = new Float32Array(p.length / 3);
          for (let i = 1; i < cumulative.length; i += 1) {
            cumulative[i] =
              cumulative[i - 1]! + Math.hypot(p[i * 3]! - p[i * 3 - 3]!, p[i * 3 + 1]! - p[i * 3 - 2]!, p[i * 3 + 2]! - p[i * 3 - 1]!);
          }
          return { points: p, cumulative, speed: path.speed, color: path.color };
        });
      pulsePositions.fill(-1000);
    },

    setResolution(width, height): void {
      material.resolution.set(width, height);
    },

    update(dt, now): void {
      time.value = now;
      clock += dt;
      // Rastros que já apagaram saem do buffer.
      if (snapshots.some((snapshot) => now - snapshot.death > GONE)) {
        snapshots = snapshots.filter((snapshot) => now - snapshot.death <= GONE);
        rebuild();
      }
      let k = 0;
      for (const path of current) {
        const total = path.cumulative[path.cumulative.length - 1] ?? 0;
        if (total <= 0) continue;
        for (let j = 0; j < PULSES_PER_PATH; j += 1) {
          // Cada pulso percorre o caminho e recomeça no canhão.
          const s = (clock * path.speed + (j / PULSES_PER_PATH) * total) % total;
          let lo = 0;
          let hi = path.cumulative.length - 1;
          while (lo < hi - 1) {
            const mid = (lo + hi) >> 1;
            if (path.cumulative[mid]! <= s) lo = mid;
            else hi = mid;
          }
          const a = path.cumulative[lo]!;
          const b = path.cumulative[hi]!;
          const f = b > a ? (s - a) / (b - a) : 0;
          const p = path.points;
          for (let c = 0; c < 3; c += 1) {
            pulsePositions[k * 3 + c] = p[lo * 3 + c]! + (p[hi * 3 + c]! - p[lo * 3 + c]!) * f;
          }
          pulseColors[k * 3] = Math.min(1, path.color.r * 1.6 + 0.3);
          pulseColors[k * 3 + 1] = Math.min(1, path.color.g * 1.6 + 0.3);
          pulseColors[k * 3 + 2] = Math.min(1, path.color.b * 1.6 + 0.3);
          k += 1;
        }
      }
      for (let i = k; i < MAX_PULSES; i += 1) pulsePositions[i * 3 + 1] = -1000;
      pulseGeometry.attributes.position!.needsUpdate = true;
      pulseGeometry.attributes.color!.needsUpdate = true;
    },

    dispose(): void {
      geometry.dispose();
      material.dispose();
      pulseGeometry.dispose();
      pulseMaterial.dispose();
      dotTexture.dispose();
      group.clear();
    },
  };
}
