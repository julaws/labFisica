import * as THREE from 'three';
import type { HelixPath, Vec3 } from '../../optics/fields/lorentz';

/**
 * Rastros luminosos dos elétrons (ADR 0010), como no gás de um tubo de feixe
 * fino ou numa câmara de bolhas, calculados **na placa de vídeo**.
 *
 * A trajetória de cada elétron é uma fórmula do motor (`HelixPath`):
 * r(s) = origem + a·s + u·sen s + w·(1 − cos s). A geometria das linhas é
 * fixa — para cada elétron, um trecho reto do canhão à câmara e 240
 * segmentos da hélice, com s normalizado — e o vertex shader avalia a fórmula
 * com os parâmetros de cada elétron, lidos de uma textura de dados pequena
 * (`texelFetch`). Uniforms em array com índice dinâmico seriam o caminho
 * óbvio, mas no Direct3D viram um código lentíssimo: 130 ms por quadro.
 *
 * Mudar o campo, então, só troca uns poucos números. Antes, cada mudança
 * reescrevia milhares de vértices, e o Direct3D (via ANGLE) parava a GPU por
 * até 1 s a cada reescrita.
 *
 * - Cada recálculo é um **instantâneo** de até 5 elétrons. O atual brilha
 *   fixo; os 5 anteriores esmaecem: arrastar um slider deixa um leque de
 *   arcos se apagando.
 * - Pontos claros andam pelas trajetórias atuais (os elétrons), também
 *   posicionados no shader, por um relógio.
 * - As linhas têm largura em pixels, com borda suave.
 */

export interface TrackSpec {
  readonly path: HelixPath;
  /** Ponta do canhão: o trecho reto vai daqui até a origem da hélice. */
  readonly nozzle: Vec3;
  readonly color: THREE.Color;
  /** Velocidade desenhada dos pontos, m/s de cena. */
  readonly speed: number;
}

export interface ElectronTracks {
  readonly group: THREE.Group;
  readonly glowing: THREE.Object3D[];
  /** Troca as trajetórias atuais; as anteriores esmaecem. */
  push(tracks: readonly TrackSpec[], now: number): void;
  /** Tamanho do buffer de desenho, em pixels do dispositivo, e a densidade de pixels. */
  setResolution(width: number, height: number, pixelRatio: number): void;
  update(dt: number, now: number): void;
  dispose(): void;
}

const SNAPSHOTS = 6;
const PER_SNAPSHOT = 5;
const SLOTS = SNAPSHOTS * PER_SNAPSHOT;
const SEGMENTS = 240;
/** Tempo de esmaecimento de um rastro antigo, s. */
const FADE = 0.25;
const PULSES_PER_TRACK = 3;
const ALIVE = 1e9;
const LINE_WIDTH = 2.4;

/** Colunas da textura de parâmetros: um texel RGBA por vetor, uma linha por elétron. */
const COLUMNS = 6;

const PATH_GLSL = /* glsl */ `
  uniform highp sampler2D uParams;
  uniform vec3 uNozzle;
  // Coluna 0: origem e fim; 1: a e hora da morte; 2: u; 3: w; 4: cor;
  // 5: comprimento do trecho reto, comprimento por unidade, total, velocidade.
  vec4 param(int k, int column) {
    return texelFetch(uParams, ivec2(column, k), 0);
  }
  vec3 pathPoint(int k, float s) {
    return param(k, 0).xyz + param(k, 1).xyz * s + param(k, 2).xyz * sin(s) + param(k, 3).xyz * (1.0 - cos(s));
  }
`;

export function createElectronTracks(): ElectronTracks {
  const group = new THREE.Group();
  group.name = 'electron-tracks';

  // Parâmetros de cada espaço, numa textura de ponto flutuante.
  const params = new Float32Array(COLUMNS * SLOTS * 4);
  const texture = new THREE.DataTexture(params, COLUMNS, SLOTS, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  const at = (slot: number, column: number): number => (slot * COLUMNS + column) * 4;
  const write = (slot: number, column: number, x: number, y: number, z: number, w: number): void => {
    params.set([x, y, z, w], at(slot, column));
  };
  for (let slot = 0; slot < SLOTS; slot += 1) params[at(slot, 1) + 3] = -ALIVE;
  const nozzle = new THREE.Vector3();
  const shared = { uParams: { value: texture }, uNozzle: { value: nozzle } };

  // --- Linhas: quads por instância, geometria fixa -----------------------------
  const lineGeometry = new THREE.InstancedBufferGeometry();
  // O canto de cada quad (início ou fim, lado) vai em `aCorner`; `position`
  // fica zerado de propósito. Passagens do pós-processamento que desenham a
  // cena com um material substituto (máscara do bloom, profundidade) usam
  // `position` direto: com o quad nele, cada instância virava um quadrado de
  // 1 × 2 m no mesmo lugar, milhares de camadas — 33 ms por quadro. Zerado,
  // vira triângulo de área nula e não custa nada.
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
  lineGeometry.setAttribute('aCorner', new THREE.Float32BufferAttribute([0, -1, 0, 1, 1, -1, 1, 1], 2));
  lineGeometry.setIndex([0, 2, 1, 2, 3, 1]);
  const instances = SLOTS * (SEGMENTS + 1);
  const slotOf = new Float32Array(instances);
  const s0 = new Float32Array(instances);
  const s1 = new Float32Array(instances);
  const neck = new Float32Array(instances);
  let n = 0;
  for (let slot = 0; slot < SLOTS; slot += 1) {
    slotOf[n] = slot;
    neck[n] = 1;
    n += 1;
    for (let i = 0; i < SEGMENTS; i += 1) {
      slotOf[n] = slot;
      s0[n] = i / SEGMENTS;
      s1[n] = (i + 1) / SEGMENTS;
      n += 1;
    }
  }
  lineGeometry.setAttribute('aSlot', new THREE.InstancedBufferAttribute(slotOf, 1));
  lineGeometry.setAttribute('aS0', new THREE.InstancedBufferAttribute(s0, 1));
  lineGeometry.setAttribute('aS1', new THREE.InstancedBufferAttribute(s1, 1));
  lineGeometry.setAttribute('aNeck', new THREE.InstancedBufferAttribute(neck, 1));
  lineGeometry.instanceCount = instances;

  const time = { value: 0 };
  const resolution = { value: new THREE.Vector2(1, 1) };
  const width = { value: LINE_WIDTH };
  const lineMaterial = new THREE.ShaderMaterial({
    uniforms: { ...shared, uTime: time, uResolution: resolution, uWidth: width },
    vertexShader: /* glsl */ `
      attribute float aSlot;
      attribute float aS0;
      attribute float aS1;
      attribute float aNeck;
      attribute vec2 aCorner;
      uniform vec2 uResolution;
      uniform float uWidth;
      uniform float uTime;
      varying vec3 vColor;
      varying float vSide;
      ${PATH_GLSL}
      void main() {
        int k = int(aSlot + 0.5);
        vec4 start = param(k, 0);
        float end = start.w;
        vec3 p0 = aNeck > 0.5 ? uNozzle : pathPoint(k, aS0 * end);
        vec3 p1 = aNeck > 0.5 ? start.xyz : pathPoint(k, aS1 * end);
        vec4 c0 = projectionMatrix * modelViewMatrix * vec4(p0, 1.0);
        vec4 c1 = projectionMatrix * modelViewMatrix * vec4(p1, 1.0);
        // Direção do segmento na tela, em pixels; a largura sai em pixels.
        vec2 d = (c1.xy / c1.w - c0.xy / c0.w) * uResolution;
        float len = length(d);
        vec2 dir = len > 1e-6 ? d / len : vec2(1.0, 0.0);
        vec2 normal = vec2(-dir.y, dir.x);
        vec4 c = aCorner.x < 0.5 ? c0 : c1;
        c.xy += normal * aCorner.y * uWidth / uResolution * c.w;
        gl_Position = c;
        float death = param(k, 1).w;
        float fade = death > uTime ? 1.0 : exp(-(uTime - death) / ${FADE.toFixed(2)});
        vColor = param(k, 4).rgb * fade;
        vSide = aCorner.y;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vSide;
      void main() {
        // Borda suave: mais claro no meio da linha.
        float a = 1.0 - vSide * vSide;
        gl_FragColor = vec4(vColor * a, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const lines = new THREE.Mesh(lineGeometry, lineMaterial);
  lines.frustumCulled = false;
  lines.name = 'electron-track-lines';
  group.add(lines);

  // --- Elétrons: pontos que andam pelas trajetórias atuais ---------------------
  // Por elétron atual: comprimento do trecho reto, comprimento por unidade de
  // s, comprimento total e velocidade desenhada.
  const base = { value: 0 };
  const clock = { value: 0 };
  const pulseGeometry = new THREE.BufferGeometry();
  const pulseCount = PER_SNAPSHOT * PULSES_PER_TRACK;
  const pulseTrack = new Float32Array(pulseCount);
  const pulsePhase = new Float32Array(pulseCount);
  for (let i = 0; i < pulseCount; i += 1) {
    pulseTrack[i] = Math.floor(i / PULSES_PER_TRACK);
    pulsePhase[i] = (i % PULSES_PER_TRACK) / PULSES_PER_TRACK;
  }
  // A posição real sai do shader; este atributo só dá o número de vértices.
  pulseGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pulseCount * 3), 3));
  pulseGeometry.setAttribute('aTrack', new THREE.BufferAttribute(pulseTrack, 1));
  pulseGeometry.setAttribute('aPhase', new THREE.BufferAttribute(pulsePhase, 1));
  const pulseMaterial = new THREE.ShaderMaterial({
    uniforms: { ...shared, uBase: base, uClock: clock, uSize: { value: 0.022 }, uResolution: resolution },
    vertexShader: /* glsl */ `
      attribute float aTrack;
      attribute float aPhase;
      uniform float uBase;
      uniform float uClock;
      uniform float uSize;
      uniform vec2 uResolution;
      varying vec3 vColor;
      ${PATH_GLSL}
      void main() {
        int k = int(uBase + 0.5) + int(aTrack + 0.5);
        vec4 m = param(k, 5);
        if (m.z <= 0.0) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }
        // Cada ponto percorre o caminho e recomeça no canhão.
        float s = mod(uClock * m.w + aPhase * m.z, m.z);
        vec3 p = s < m.x
          ? mix(uNozzle, param(k, 0).xyz, s / m.x)
          : pathPoint(k, min((s - m.x) / m.y, param(k, 0).w));
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * view;
        // Tamanho em perspectiva, como o PointsMaterial: metade da altura da tela.
        gl_PointSize = uSize * projectionMatrix[1][1] * 0.5 * uResolution.y / -view.z;
        vColor = min(param(k, 4).rgb * 1.6 + 0.3, vec3(1.0));
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - r), 1.5);
        gl_FragColor = vec4(vColor * a, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pulses = new THREE.Points(pulseGeometry, pulseMaterial);
  pulses.frustumCulled = false;
  pulses.name = 'electron-pulses';
  group.add(pulses);

  let snapshot = -1;

  return {
    group,
    glowing: [lines, pulses],

    push(tracks, now): void {
      // O instantâneo atual passa a esmaecer a partir de agora.
      if (snapshot >= 0) {
        for (let i = 0; i < PER_SNAPSHOT; i += 1) {
          const index = at(snapshot * PER_SNAPSHOT + i, 1) + 3;
          if (params[index]! >= ALIVE) params[index] = now;
        }
      }
      snapshot = (snapshot + 1) % SNAPSHOTS;
      const first = snapshot * PER_SNAPSHOT;
      base.value = first;
      for (let i = 0; i < PER_SNAPSHOT; i += 1) {
        const k = first + i;
        const track = tracks[i];
        if (!track) {
          params.fill(0, at(k, 0), at(k + 1, 0));
          params[at(k, 1) + 3] = -ALIVE;
          continue;
        }
        const { path } = track;
        nozzle.set(track.nozzle[0], track.nozzle[1], track.nozzle[2]);
        write(k, 0, path.origin[0], path.origin[1], path.origin[2], path.end);
        write(k, 1, path.along[0], path.along[1], path.along[2], ALIVE);
        write(k, 2, path.sine[0], path.sine[1], path.sine[2], 0);
        write(k, 3, path.cosine[0], path.cosine[1], path.cosine[2], 0);
        write(k, 4, track.color.r, track.color.g, track.color.b, 0);
        const neckLength = Math.hypot(
          path.origin[0] - track.nozzle[0],
          path.origin[1] - track.nozzle[1],
          path.origin[2] - track.nozzle[2],
        );
        write(k, 5, neckLength, path.lengthPerUnit, neckLength + path.end * path.lengthPerUnit, track.speed);
      }
      texture.needsUpdate = true;
    },

    setResolution(bufferWidth, bufferHeight, pixelRatio): void {
      resolution.value.set(bufferWidth, bufferHeight);
      // A largura vale em pixels de CSS: a mesma espessura numa tela retina.
      width.value = LINE_WIDTH * pixelRatio;
    },

    update(dt, now): void {
      time.value = now;
      clock.value += dt;
    },

    dispose(): void {
      lineGeometry.dispose();
      lineMaterial.dispose();
      pulseGeometry.dispose();
      pulseMaterial.dispose();
      texture.dispose();
      group.clear();
    },
  };
}
