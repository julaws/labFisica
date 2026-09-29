import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

/**
 * Renderizador de raios, reutilizável entre experimentos (SPEC §6.5 e §7).
 *
 * As linhas têm espessura em **pixels** (`LineMaterial`): um raio de luz
 * precisa ter a mesma presença visual perto e longe da câmera. Partículas
 * percorrem o caminho para indicar o sentido de propagação.
 *
 * Todos os raios vão num **único** `LineSegments2`, com cor por vértice. Antes
 * eram um `Line2` por raio — 54 draw calls só para os leques do experimento 1,
 * o maior item do orçamento da SPEC §8. Como o blending é aditivo, a opacidade
 * de cada raio pode ir embutida na própria cor sem mudar o resultado.
 *
 * Este módulo não sabe óptica: recebe caminhos já traçados, em coordenadas de
 * cena, e desenha. Quem traça é o motor em `src/optics/`.
 */

export interface RayPath {
  /** Pontos do caminho, na ordem da luz. */
  readonly points: readonly THREE.Vector3Like[];
  /** Cor da linha; por convenção, a cor do objeto de origem. */
  readonly color: number;
  /** Opacidade, 0 a 1. Raios bloqueados entram mais apagados. */
  readonly opacity?: number;
}

export interface RayBundle {
  readonly group: THREE.Group;
  /** Substitui os caminhos desenhados. */
  setPaths(paths: readonly RayPath[]): void;
  /** Avança as partículas. */
  update(dt: number): void;
  setResolution(width: number, height: number): void;
  setVisible(visible: boolean): void;
  /** Liga ou desliga as partículas (prefers-reduced-motion, SPEC §9). */
  setParticlesEnabled(enabled: boolean): void;
  dispose(): void;
}

export interface RayBundleOptions {
  /** Espessura das linhas, em pixels. */
  readonly lineWidth?: number;
  /** Partículas por raio. */
  readonly particlesPerPath?: number;
  /** Velocidade das partículas, em fração do caminho por segundo. */
  readonly particleSpeed?: number;
}

export function createRayBundle({
  lineWidth = 2,
  particlesPerPath = 3,
  particleSpeed = 0.35,
}: RayBundleOptions = {}): RayBundle {
  const group = new THREE.Group();
  group.name = 'rays';

  const resolution = new THREE.Vector2(window.innerWidth, window.innerHeight);

  // --- Linhas: um único objeto para todos os raios ---------------------------
  let lineGeometry = new LineSegmentsGeometry();
  const lineMaterial = new LineMaterial({
    linewidth: lineWidth,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    worldUnits: false,
  });
  lineMaterial.resolution.copy(resolution);

  const lines = new LineSegments2(lineGeometry, lineMaterial);
  lines.frustumCulled = false;
  group.add(lines);

  // --- Partículas: um único Points, atualizado por quadro --------------------
  const particleGeometry = new THREE.BufferGeometry();
  const particleMaterial = new THREE.PointsMaterial({
    size: 0.012,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  particles.frustumCulled = false;
  group.add(particles);

  let paths: readonly RayPath[] = [];
  let particlesEnabled = true;
  let phase = 0;

  /** Comprimento acumulado de cada caminho, para interpolar as partículas. */
  const cumulative: number[][] = [];

  function rebuildParticles(): void {
    const count = particlesEnabled ? paths.length * particlesPerPath : 0;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();

    let index = 0;
    if (particlesEnabled) {
      for (const path of paths) {
        color.setHex(path.color);
        for (let i = 0; i < particlesPerPath; i += 1) {
          colors[index * 3] = color.r;
          colors[index * 3 + 1] = color.g;
          colors[index * 3 + 2] = color.b;
          index += 1;
        }
      }
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    particles.visible = count > 0;
  }

  /** Ponto a uma fração do caminho, medido em comprimento de arco. */
  function sampleAt(pathIndex: number, t: number, target: THREE.Vector3): void {
    const path = paths[pathIndex];
    const lengths = cumulative[pathIndex];
    if (!path || !lengths || path.points.length < 2) return;

    const total = lengths.at(-1) ?? 0;
    if (total === 0) return;

    const distance = t * total;
    let segment = 1;
    while (segment < lengths.length - 1 && lengths[segment]! < distance) segment += 1;

    const start = path.points[segment - 1]!;
    const end = path.points[segment]!;
    const segmentStart = lengths[segment - 1]!;
    const segmentLength = lengths[segment]! - segmentStart;
    const local = segmentLength === 0 ? 0 : (distance - segmentStart) / segmentLength;

    target.set(
      start.x + (end.x - start.x) * local,
      start.y + (end.y - start.y) * local,
      start.z + (end.z - start.z) * local,
    );
  }

  const scratch = new THREE.Vector3();

  return {
    group,

    setPaths(next: readonly RayPath[]): void {
      paths = next;
      cumulative.length = 0;

      // Cada caminho de N pontos vira N−1 segmentos soltos (pares de pontos).
      const positions: number[] = [];
      const colors: number[] = [];
      const color = new THREE.Color();

      for (const path of next) {
        const opacity = path.opacity ?? 0.85;
        // Blending aditivo: escurecer a cor equivale a baixar a opacidade.
        color.setHex(path.color).multiplyScalar(opacity);

        const lengths: number[] = [0];
        for (let i = 1; i < path.points.length; i += 1) {
          const a = path.points[i - 1]!;
          const b = path.points[i]!;
          positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
          colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
          lengths.push(lengths[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
        }
        cumulative.push(lengths);
      }

      // O número de segmentos muda com o estado; trocar a geometria é mais
      // simples e seguro que redimensionar os atributos instanciados.
      lineGeometry.dispose();
      lineGeometry = new LineSegmentsGeometry();
      if (positions.length > 0) {
        lineGeometry.setPositions(positions);
        lineGeometry.setColors(colors);
      }
      lines.geometry = lineGeometry;
      lines.visible = positions.length > 0;
      if (lines.visible) lines.computeLineDistances();

      rebuildParticles();
    },

    update(dt: number): void {
      if (!particlesEnabled || paths.length === 0) return;

      phase = (phase + dt * particleSpeed) % 1;
      const attribute = particleGeometry.getAttribute('position');
      if (!attribute) return;

      let index = 0;
      for (let pathIndex = 0; pathIndex < paths.length; pathIndex += 1) {
        for (let i = 0; i < particlesPerPath; i += 1) {
          const t = (phase + i / particlesPerPath) % 1;
          sampleAt(pathIndex, t, scratch);
          attribute.setXYZ(index, scratch.x, scratch.y, scratch.z);
          index += 1;
        }
      }

      attribute.needsUpdate = true;
    },

    setResolution(width: number, height: number): void {
      resolution.set(width, height);
      lineMaterial.resolution.copy(resolution);
    },

    setVisible(visible: boolean): void {
      group.visible = visible;
    },

    setParticlesEnabled(enabled: boolean): void {
      particlesEnabled = enabled;
      rebuildParticles();
    },

    dispose(): void {
      lineGeometry.dispose();
      lineMaterial.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      group.clear();
    },
  };
}
