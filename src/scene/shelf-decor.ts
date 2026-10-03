import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from './materials';

/**
 * Enfeites de física na prateleira do meio da estante: um globo, um
 * telescópio, um átomo de órbitas acesas, um foguete, um pêndulo de Newton e
 * um ímã em ferradura. Tudo procedural, em coordenadas da estante (x ao longo
 * da prateleira, y a partir do piso, z = 0 no meio da tábua).
 *
 * Orçamento (SPEC §8): as peças pintadas são uma malha só, com a cor em cada
 * vértice; o latão, o cromo e as órbitas acesas são mais três malhas.
 */

export interface ShelfDecor {
  readonly group: THREE.Group;
  /** Órbitas e elétrons do átomo, para o bloom. */
  readonly glowing: THREE.Object3D[];
  dispose(): void;
}

export interface ShelfDecorOptions {
  readonly materials: MaterialLibrary;
  /** Altura do tampo da prateleira, m. */
  readonly top: number;
}

/** Copia a geometria sem índice e sem cor, para todas mesclarem juntas. */
function plain(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  for (const name of Object.keys(flat.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') flat.deleteAttribute(name);
  }
  return flat;
}

/** Pinta todos os vértices de uma cor (ou por uma função da posição). */
function paint(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation | ((p: THREE.Vector3) => THREE.Color),
): THREE.BufferGeometry {
  const flat = plain(geometry);
  const position = flat.attributes.position!;
  const colors = new Float32Array(position.count * 3);
  const fixed = typeof color === 'function' ? null : new THREE.Color(color);
  const p = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    const c = fixed ?? (color as (q: THREE.Vector3) => THREE.Color)(p.fromBufferAttribute(position, i));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return flat;
}

/**
 * Os enfeites são modelados em tamanho de mesa e ampliados juntos, com o
 * pivô no tampo da prateleira: assim enchem o vão de 0,46 m até a de cima.
 * As posições em x abaixo são divididas pela escala para cair no lugar.
 */
const SCALE = 1.3;

export function createShelfDecor({ materials, top }: ShelfDecorOptions): ShelfDecor {
  const group = new THREE.Group();
  group.name = 'shelf-decor';
  group.scale.setScalar(SCALE);
  group.position.y = top * (1 - SCALE);
  const owned: (THREE.BufferGeometry | THREE.Material)[] = [];
  const glowing: THREE.Object3D[] = [];

  const painted: THREE.BufferGeometry[] = [];
  const brass: THREE.BufferGeometry[] = [];
  const chrome: THREE.BufferGeometry[] = [];
  const lit: THREE.BufferGeometry[] = [];

  const DARK = 0x16181d;
  const WOOD = 0x4a2e1b;

  // --- Globo (x = −2,1) -----------------------------------------------------------
  {
    const x = -2.1 / SCALE;
    const radius = 0.095;
    const cy = top + 0.07 + radius;
    brass.push(
      plain(new THREE.CylinderGeometry(0.06, 0.07, 0.016, 32).translate(x, top + 0.008, 0)),
      plain(new THREE.CylinderGeometry(0.008, 0.01, 0.07, 10).translate(x, top + 0.05, 0)),
      // Meridiano: meio anel em volta do globo, inclinado com o eixo.
      plain(
        new THREE.TorusGeometry(radius + 0.012, 0.004, 8, 48, Math.PI)
          .rotateZ(-Math.PI / 2)
          .rotateZ(0.41)
          .translate(x, cy, 0),
      ),
    );
    // Continentes: manchas de uma soma de senos sobre a direção, sem textura.
    const ocean = new THREE.Color(0x24507e);
    const land = new THREE.Color(0x6f8a45);
    const ice = new THREE.Color(0xdfe6ea);
    const tilt = new THREE.Matrix4().makeRotationZ(0.41);
    const sphere = new THREE.SphereGeometry(radius, 48, 32).applyMatrix4(tilt);
    painted.push(
      paint(sphere, (p) => {
        const d = p.clone().normalize();
        if (Math.abs(d.y) > 0.9) return ice;
        const n =
          Math.sin(d.x * 5.1 + 1.3) * Math.cos(d.z * 4.3 - 0.4) + Math.sin(d.y * 6.2 + d.x * 2.1) * 0.6;
        return n > 0.35 ? land : ocean;
      }).translate(x, cy, 0),
    );
  }

  // --- Telescópio (x = −1,42) --------------------------------------------------------
  {
    const x = -1.42 / SCALE;
    const head = top + 0.2;
    // Tripé: três pernas de madeira abertas.
    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * Math.PI * 2 + 0.3;
      const foot = new THREE.Vector3(Math.cos(angle) * 0.09, 0, Math.sin(angle) * 0.09);
      const leg = new THREE.Vector3(0, 0.2, 0).sub(foot);
      const length = leg.length();
      const geometry = new THREE.CylinderGeometry(0.005, 0.006, length, 8).translate(0, length / 2, 0);
      geometry.applyMatrix4(
        new THREE.Matrix4().makeRotationFromQuaternion(
          new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), leg.clone().normalize()),
        ),
      );
      painted.push(paint(geometry, WOOD).translate(x + foot.x, top + foot.y, foot.z));
    }
    // Tubo azul-marinho apontado para o alto, com anéis de latão e ocular.
    const aim = new THREE.Matrix4().makeRotationZ(-Math.PI / 2 + 0.5);
    const along = (offset: number): THREE.Vector3 =>
      new THREE.Vector3(0, offset, 0).applyMatrix4(aim).add(new THREE.Vector3(x, head + 0.02, 0));
    const tube = new THREE.CylinderGeometry(0.03, 0.026, 0.36, 24).applyMatrix4(aim);
    const center = along(0.03);
    painted.push(paint(tube, 0x1b2a4d).translate(center.x, center.y, center.z));
    for (const [offset, r] of [
      [0.21, 0.034],
      [-0.15, 0.03],
    ] as const) {
      const ring = new THREE.CylinderGeometry(r, r, 0.022, 24).applyMatrix4(aim);
      const at = along(offset);
      brass.push(plain(ring).translate(at.x, at.y, at.z));
    }
    const eyepiece = new THREE.CylinderGeometry(0.009, 0.009, 0.05, 12).applyMatrix4(aim);
    const eye = along(-0.18);
    painted.push(paint(eyepiece, DARK).translate(eye.x, eye.y, eye.z));
    brass.push(plain(new THREE.SphereGeometry(0.014, 12, 8).translate(x, head, 0)));
  }

  // --- Átomo (x = −0,52) -------------------------------------------------------------
  {
    const x = -0.52 / SCALE;
    const cy = top + 0.22;
    painted.push(
      paint(new THREE.CylinderGeometry(0.05, 0.06, 0.035, 24), DARK).translate(x, top + 0.0175, 0),
      // Haste da base até o núcleo.
      paint(new THREE.CylinderGeometry(0.004, 0.004, cy - top - 0.05, 8), DARK).translate(x, (top + 0.035 + cy - 0.015) / 2, 0),
    );
    // Núcleo: prótons vermelhos e nêutrons cinza num cacho.
    const nucleons = [
      [0, 0, 0],
      [0.017, 0.006, 0.004],
      [-0.015, 0.008, -0.006],
      [0.004, -0.016, 0.007],
      [-0.006, 0.004, 0.017],
      [0.007, 0.012, -0.015],
      [-0.01, -0.01, -0.012],
    ];
    nucleons.forEach(([nx, ny, nz], index) => {
      painted.push(
        paint(new THREE.SphereGeometry(0.0125, 14, 10), index % 2 === 0 ? 0xc8402e : 0x9aa3ad).translate(
          x + nx!,
          cy + ny!,
          nz!,
        ),
      );
    });
    // Três órbitas acesas, cada uma com o seu elétron.
    const orbitRadius = 0.12;
    [0, Math.PI / 3, -Math.PI / 3].forEach((spin, index) => {
      const rotation = new THREE.Matrix4()
        .makeRotationY(spin)
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2 - 0.35));
      lit.push(plain(new THREE.TorusGeometry(orbitRadius, 0.0024, 6, 72).applyMatrix4(rotation).translate(x, cy, 0)));
      const phase = 0.8 + index * 2.1;
      const electron = new THREE.Vector3(Math.cos(phase) * orbitRadius, Math.sin(phase) * orbitRadius, 0)
        .applyMatrix4(rotation)
        .add(new THREE.Vector3(x, cy, 0));
      lit.push(plain(new THREE.SphereGeometry(0.011, 12, 8).translate(electron.x, electron.y, electron.z)));
    });
  }

  // --- Foguete (x = 0,55) -----------------------------------------------------------
  {
    const x = 0.55 / SCALE;
    const base = top + 0.035;
    const body = 0.19;
    painted.push(
      paint(new THREE.CylinderGeometry(0.034, 0.036, body, 28), 0xe9e6df).translate(x, base + body / 2, 0),
      paint(new THREE.ConeGeometry(0.034, 0.09, 28), 0xc23b2c).translate(x, base + body + 0.045, 0),
      paint(new THREE.CylinderGeometry(0.022, 0.03, 0.035, 20, 1, true), DARK).translate(x, base - 0.016, 0),
      // Faixa vermelha e janela.
      paint(new THREE.CylinderGeometry(0.0365, 0.0365, 0.02, 28), 0xc23b2c).translate(x, base + 0.05, 0),
      paint(new THREE.SphereGeometry(0.014, 14, 10), 0x7fb8e6).translate(x, base + body * 0.68, 0.031),
    );
    brass.push(
      plain(
        new THREE.TorusGeometry(0.015, 0.003, 8, 24).translate(x, base + body * 0.68, 0.034),
      ),
    );
    // Três aletas, que também são os pés.
    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * Math.PI * 2 + Math.PI / 2;
      const fin = new THREE.BoxGeometry(0.05, 0.08, 0.006)
        .translate(0.055, 0.005, 0)
        .rotateY(angle)
        .translate(x, base + 0.005, 0);
      painted.push(paint(fin, 0xc23b2c));
    }
  }

  // --- Pêndulo de Newton (x = 1,38) ---------------------------------------------
  {
    const x = 1.38 / SCALE;
    const width = 0.2;
    const height = 0.18;
    const half = 0.045;
    painted.push(paint(new THREE.BoxGeometry(width + 0.04, 0.018, 0.12), DARK).translate(x, top + 0.009, 0));
    for (const side of [-1, 1]) {
      for (const sx of [-width / 2, width / 2]) {
        chrome.push(
          plain(new THREE.CylinderGeometry(0.004, 0.004, height, 8).translate(x + sx, top + 0.018 + height / 2, side * half)),
        );
      }
      chrome.push(
        plain(
          new THREE.CylinderGeometry(0.004, 0.004, width, 8)
            .rotateZ(Math.PI / 2)
            .translate(x, top + 0.018 + height, side * half),
        ),
      );
    }
    // Cinco esferas em fila, cada uma pendurada por um V de fio.
    const ball = 0.019;
    const ballY = top + 0.018 + 0.055;
    for (let i = 0; i < 5; i += 1) {
      const bx = x + (i - 2) * ball * 2;
      chrome.push(plain(new THREE.SphereGeometry(ball, 20, 14).translate(bx, ballY, 0)));
      for (const side of [-1, 1]) {
        const from = new THREE.Vector3(bx, ballY + ball, 0);
        const to = new THREE.Vector3(bx, top + 0.018 + height, side * half);
        const span = to.clone().sub(from);
        const wire = new THREE.CylinderGeometry(0.0009, 0.0009, span.length(), 4)
          .applyMatrix4(
            new THREE.Matrix4().makeRotationFromQuaternion(
              new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), span.clone().normalize()),
            ),
          )
          .translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
        painted.push(paint(wire, 0xb8bcc4));
      }
    }
  }

  // --- Ímã em ferradura (x = 2,08) ----------------------------------------------------
  {
    const x = 2.08 / SCALE;
    const r = 0.05;
    const thick = 0.017;
    const legs = 0.07;
    // O arco começa onde as pernas terminam.
    const bendY = top + 0.02 + legs;
    painted.push(
      paint(new THREE.TorusGeometry(r, thick, 12, 32, Math.PI), 0xc23b2c).translate(x, bendY, 0),
      paint(new THREE.CylinderGeometry(thick, thick, legs, 16), 0xc23b2c).translate(x - r, top + 0.02 + legs / 2, 0),
      paint(new THREE.CylinderGeometry(thick, thick, legs, 16), 0xc23b2c).translate(x + r, top + 0.02 + legs / 2, 0),
    );
    // Polos prateados.
    chrome.push(
      plain(new THREE.CylinderGeometry(thick, thick, 0.02, 16).translate(x - r, top + 0.01, 0)),
      plain(new THREE.CylinderGeometry(thick, thick, 0.02, 16).translate(x + r, top + 0.01, 0)),
    );
  }

  const merge = (parts: THREE.BufferGeometry[], what: string): THREE.BufferGeometry => {
    const merged = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    if (!merged) throw new Error(`Falha ao mesclar ${what}`);
    owned.push(merged);
    return merged;
  };

  const paintMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.08 });
  const chromeMaterial = new THREE.MeshStandardMaterial({ color: 0xd4d8de, roughness: 0.18, metalness: 1 });
  owned.push(paintMaterial, chromeMaterial);

  const paintedMesh = new THREE.Mesh(merge(painted, 'os enfeites pintados'), paintMaterial);
  const brassMesh = new THREE.Mesh(merge(brass, 'o latão dos enfeites'), materials.brushedBrass);
  const chromeMesh = new THREE.Mesh(merge(chrome, 'o cromo dos enfeites'), chromeMaterial);
  const litMesh = new THREE.Mesh(merge(lit, 'as órbitas'), materials.emissive(0x7fe3ff, 2.2));
  for (const mesh of [paintedMesh, brassMesh, chromeMesh]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  group.add(paintedMesh, brassMesh, chromeMesh, litMesh);
  glowing.push(litMesh);

  return {
    group,
    glowing,
    dispose(): void {
      for (const item of owned) item.dispose();
      owned.length = 0;
      group.clear();
    },
  };
}
