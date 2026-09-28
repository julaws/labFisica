import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

/**
 * Renderizador de raios, reutilizável entre experimentos (SPEC §6.5 e §7).
 *
 * As linhas usam `Line2`, que tem espessura em **pixels**: um raio de luz
 * precisa ter a mesma presença visual perto e longe da câmera. Partículas
 * percorrem o caminho para indicar o sentido de propagação.
 *
 * Este módulo não sabe óptica: ele recebe caminhos já traçados, em coordenadas
 * de cena, e desenha. Quem traça é o motor em `src/optics/`.
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

  const lines: Line2[] = [];
  const materials: LineMaterial[] = [];
  const geometries: LineGeometry[] = [];

  let paths: readonly RayPath[] = [];
  let particlesEnabled = true;
  let phase = 0;

  // Partículas: um único Points para todos os raios, atualizado por quadro.
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

  const resolution = new THREE.Vector2(window.innerWidth, window.innerHeight);

  /** Comprimento acumulado de um caminho, para interpolar as partículas. */
  const cumulative: number[][] = [];

  function rebuildParticles(): void {
    const count = particlesEnabled ? paths.length * particlesPerPath : 0;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();

    let index = 0;
    for (const path of paths) {
      color.setHex(path.color);
      for (let i = 0; i < particlesPerPath; i += 1) {
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
        index += 1;
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
      // Recicla as linhas existentes e cria só o que faltar.
      while (lines.length > next.length) {
        const line = lines.pop()!;
        group.remove(line);
        geometries.pop()?.dispose();
        materials.pop()?.dispose();
      }

      paths = next;
      cumulative.length = 0;

      next.forEach((path, index) => {
        const flat: number[] = [];
        const lengths: number[] = [0];

        for (let i = 0; i < path.points.length; i += 1) {
          const point = path.points[i]!;
          flat.push(point.x, point.y, point.z);
          if (i > 0) {
            const previous = path.points[i - 1]!;
            const step = Math.hypot(
              point.x - previous.x,
              point.y - previous.y,
              point.z - previous.z,
            );
            lengths.push(lengths[i - 1]! + step);
          }
        }
        cumulative.push(lengths);

        let line = lines[index];
        if (!line) {
          const geometry = new LineGeometry();
          const material = new LineMaterial({
            linewidth: lineWidth,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            worldUnits: false,
          });
          material.resolution.copy(resolution);

          line = new Line2(geometry, material);
          line.frustumCulled = false;
          geometries.push(geometry);
          materials.push(material);
          lines.push(line);
          group.add(line);
        }

        line.geometry.setPositions(flat);
        line.computeLineDistances();

        const material = line.material;
        material.color.setHex(path.color);
        material.opacity = path.opacity ?? 0.85;
      });

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
      for (const material of materials) material.resolution.copy(resolution);
    },

    setVisible(visible: boolean): void {
      group.visible = visible;
    },

    setParticlesEnabled(enabled: boolean): void {
      particlesEnabled = enabled;
      rebuildParticles();
    },

    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      geometries.length = 0;
      materials.length = 0;
      lines.length = 0;
      group.clear();
    },
  };
}
