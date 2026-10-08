import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CRITICAL_IMPACT_PARAMETER,
  HORIZON_RADIUS,
  ISCO_RADIUS,
  PHOTON_SPHERE_RADIUS,
  diskTemperature,
  traceFromInfinity,
} from '../../optics/gravity/schwarzschild';
import type { MaterialLibrary } from '../../scene/materials';
import { nameplateTexture } from '../../scene/textures/procedural';
import { DISK_OUTER_RADIUS, TRACER_CHUNK, type TracerUniforms } from './tracer';

/**
 * A esfera de vidro (ADR 0017): um "universo de bolso" sobre um pedestal de
 * latão. Dentro dela, o buraco negro como a câmera do laboratório o veria:
 * cada pixel da esfera é um raio traçado da câmera real pela métrica de
 * Schwarzschild — girar a câmera em volta da bancada é orbitar o buraco negro.
 *
 * Na visão didática, o traçado dá lugar ao diagrama: o horizonte, a esfera de
 * fótons, o disco e um leque de raios vindos de longe, uns capturados, outros
 * desviados, e o raio crítico dando voltas na esfera de fótons.
 *
 * Escala: a esfera mostra uma região de raio fixo (`ORB_REGION_KM`); a massa
 * muda quantos M cabem nela, e o buraco negro cresce com a massa.
 */

/** Raio da esfera de vidro, m de cena. */
export const ORB_RADIUS = 0.3;
/** Raio da região do espaço mostrada na esfera, km. */
export const ORB_REGION_KM = 300;
/**
 * Na visão didática a esfera mostra sempre 12 M de raio, qualquer que seja a
 * massa: o diagrama é sobre a forma das órbitas, que não depende dela.
 */
export const DIDACTIC_REGION_M = 12;

export interface Orb {
  readonly group: THREE.Group;
  /** Centro da esfera, para as etiquetas e as câmeras. */
  readonly center: THREE.Object3D;
  readonly glowing: THREE.Object3D[];
  /** Pontos do diagrama para as etiquetas: horizonte, esfera de fótons, raio crítico. */
  readonly anchors: { readonly horizon: THREE.Object3D; readonly photon: THREE.Object3D; readonly critical: THREE.Object3D };
  /** Quantos M cabem no raio da esfera (traçado realista). */
  setRegion(radiusInM: number): void;
  setDidactic(on: boolean): void;
  setDiskVisible(on: boolean): void;
  setSteps(steps: number): void;
  update(elapsed: number): void;
  dispose(): void;
}

export interface OrbOptions {
  readonly materials: MaterialLibrary;
  readonly uniforms: TracerUniforms;
  readonly steps: number;
}

const ORB_VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const ORB_FRAGMENT = /* glsl */ `
${TRACER_CHUNK}
uniform vec3 uCenter;
uniform float uScale;
varying vec3 vWorld;
void main() {
  vec3 P = (cameraPosition - uCenter) * uScale;
  vec3 D = normalize(vWorld - cameraPosition);
  TraceResult hit = traceSchwarzschild(P, D);
  gl_FragColor = vec4(shadeTrace(hit), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Parâmetros de impacto do leque de raios do diagrama, em M (os dois lados). */
const FAN_B = [0.6, 1.6, 2.6, 3.6, 4.4, 4.95, 5.45, 6.1, 7, 8.2, 9.6, 11];

export function createOrb({ materials, uniforms, steps }: OrbOptions): Orb {
  const group = new THREE.Group();
  group.name = 'black-hole-orb';
  const geometries: THREE.BufferGeometry[] = [];
  const owned: (THREE.Material | THREE.Texture)[] = [];
  const glowing: THREE.Object3D[] = [];

  const center = new THREE.Object3D();
  center.position.y = ORB_RADIUS + 0.17;
  group.add(center);

  // --- O buraco negro traçado ---------------------------------------------------
  const tracerUniforms = {
    ...uniforms,
    uCenter: { value: new THREE.Vector3() },
    uScale: { value: 1 },
  };
  const tracerMaterial = new THREE.ShaderMaterial({
    defines: { TRACE_STEPS: steps },
    uniforms: tracerUniforms,
    vertexShader: ORB_VERTEX,
    fragmentShader: ORB_FRAGMENT,
  });
  owned.push(tracerMaterial);
  const sphereGeometry = new THREE.SphereGeometry(ORB_RADIUS, 96, 64);
  geometries.push(sphereGeometry);
  const tracer = new THREE.Mesh(sphereGeometry, tracerMaterial);
  tracer.name = 'black-hole-tracer';
  center.add(tracer);
  glowing.push(tracer);

  // --- Vidro por fora: só reflexo (o traçado já é o "dentro") --------------
  const glassGeometry = new THREE.SphereGeometry(ORB_RADIUS + 0.004, 96, 64);
  geometries.push(glassGeometry);
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xdfe8ff,
    metalness: 0,
    roughness: 0.04,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    transparent: true,
    opacity: 0.05,
    depthWrite: false,
    envMapIntensity: 1.2,
  });
  owned.push(glass);
  const shell = new THREE.Mesh(glassGeometry, glass);
  shell.renderOrder = 2;
  center.add(shell);

  // --- Pedestal torneado: base de aço com filete de latão, coluna balaústre
  // de latão com um nó no meio e três braços curvos que seguram o colar -------
  const collarY = -0.21;
  const collarRadius = Math.sqrt(ORB_RADIUS ** 2 - collarY ** 2) + 0.006;
  const floorY = -center.position.y;
  const baseTop = 0.08;
  const columnBottom = floorY + baseTop - 0.004;
  const columnTop = collarY - 0.07;
  const mid = (columnBottom + columnTop) / 2;
  const brassPieces: THREE.BufferGeometry[] = [
    new THREE.TorusGeometry(collarRadius, 0.011, 14, 96).rotateX(Math.PI / 2).translate(0, collarY, 0),
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, columnBottom),
        new THREE.Vector2(0.05, columnBottom),
        new THREE.Vector2(0.052, columnBottom + 0.01),
        new THREE.Vector2(0.032, columnBottom + 0.03),
        new THREE.Vector2(0.022, columnBottom + 0.055),
        new THREE.Vector2(0.022, mid - 0.025),
        new THREE.Vector2(0.038, mid - 0.008),
        new THREE.Vector2(0.038, mid + 0.008),
        new THREE.Vector2(0.022, mid + 0.025),
        new THREE.Vector2(0.024, columnTop - 0.03),
        new THREE.Vector2(0.045, columnTop - 0.006),
        new THREE.Vector2(0.045, columnTop),
        new THREE.Vector2(0, columnTop),
      ],
      48,
    ),
  ];
  for (let i = 0; i < 3; i += 1) {
    const a = (i * 2 * Math.PI) / 3 + Math.PI / 2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const arm = new THREE.CatmullRomCurve3([
      dir.clone().multiplyScalar(0.03).setY(columnTop - 0.004),
      dir.clone().multiplyScalar(collarRadius * 0.55).setY(columnTop + 0.008),
      dir.clone().multiplyScalar(collarRadius * 0.93).setY(collarY - 0.022),
      dir.clone().multiplyScalar(collarRadius).setY(collarY - 0.004),
    ]);
    brassPieces.push(new THREE.TubeGeometry(arm, 24, 0.0065, 10, false));
  }
  const brassParts = mergeGeometries(brassPieces.map((piece) => (piece.index ? piece.toNonIndexed() : piece)));
  for (const piece of brassPieces) piece.dispose();
  if (!brassParts) throw new Error('Falha ao montar o pedestal da esfera');
  geometries.push(brassParts);
  const brass = new THREE.Mesh(brassParts, materials.brushedBrass);
  brass.castShadow = true;
  center.add(brass);

  const baseGeometry = mergeGeometries(
    [
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0, 0),
          new THREE.Vector2(0.218, 0),
          new THREE.Vector2(0.222, 0.006),
          new THREE.Vector2(0.216, 0.03),
          new THREE.Vector2(0.2, 0.037),
          new THREE.Vector2(0.158, 0.04),
          new THREE.Vector2(0.152, 0.058),
          new THREE.Vector2(0.118, 0.074),
          new THREE.Vector2(0.06, baseTop),
          new THREE.Vector2(0, baseTop),
        ],
        72,
      ).toNonIndexed(),
    ],
  );
  if (!baseGeometry) throw new Error('Falha ao montar a base da esfera');
  geometries.push(baseGeometry);
  const base = new THREE.Mesh(baseGeometry, materials.darkSteel);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);
  // Filete de latão no degrau da base.
  const inlayGeometry = new THREE.TorusGeometry(0.168, 0.0035, 8, 96).rotateX(Math.PI / 2).translate(0, -center.position.y + 0.04, 0);
  geometries.push(inlayGeometry);
  const inlay = new THREE.Mesh(inlayGeometry, materials.brushedBrass);
  center.add(inlay);

  // Placa dourada na frente da base, como nas outras bancadas.
  const plateGeometry = new THREE.PlaneGeometry(0.24, 0.24 * (352 / 1024));
  geometries.push(plateGeometry);
  const plateMaterial = new THREE.MeshStandardMaterial({
    map: nameplateTexture('@juliophisico', 'BURACO NEGRO · SCHWARZSCHILD'),
    metalness: 0.75,
    roughness: 0.38,
    envMapIntensity: 0.6,
  });
  owned.push(plateMaterial);
  const plate = new THREE.Mesh(plateGeometry, plateMaterial);
  plate.name = 'nameplate';
  // À frente da borda da base (raio 0,222 no pé): inclinada, a borda de
  // baixo da placa não pode entrar no chanfro.
  plate.position.set(0, 0.04, 0.245);
  plate.rotation.x = -0.32;
  group.add(plate);

  // --- Diagrama (visão didática) -----------------------------------------------
  const diagram = new THREE.Group();
  diagram.name = 'black-hole-diagram';
  diagram.visible = false;
  center.add(diagram);

  const horizonGeometry = new THREE.SphereGeometry(HORIZON_RADIUS, 48, 32);
  geometries.push(horizonGeometry);
  const horizonMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  owned.push(horizonMaterial);
  diagram.add(new THREE.Mesh(horizonGeometry, horizonMaterial));

  const photonGeometry = new THREE.SphereGeometry(PHOTON_SPHERE_RADIUS, 48, 32);
  geometries.push(photonGeometry);
  const photonMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd36b,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    toneMapped: false,
  });
  owned.push(photonMaterial);
  const photonSphere = new THREE.Mesh(photonGeometry, photonMaterial);
  diagram.add(photonSphere);

  // Círculos no plano dos raios (de frente para a câmera): horizonte, esfera
  // de fótons e o raio crítico b_c, tracejado.
  const circle = (radius: number, segments = 160): THREE.BufferGeometry => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  };
  const ringMaterial = (color: number, opacity: number, dashed: boolean): THREE.LineBasicMaterial => {
    const material = dashed
      ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.35, gapSize: 0.25, toneMapped: false })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity, toneMapped: false });
    owned.push(material);
    return material;
  };
  const horizonRing = new THREE.Line(circle(HORIZON_RADIUS), ringMaterial(0xe6eaf2, 0.7, false));
  const photonRing = new THREE.Line(circle(PHOTON_SPHERE_RADIUS), ringMaterial(0xffd36b, 0.95, false));
  const criticalRing = new THREE.Line(circle(CRITICAL_IMPACT_PARAMETER), ringMaterial(0x7fe3ff, 0.75, true));
  criticalRing.computeLineDistances();
  for (const ring of [horizonRing, photonRing, criticalRing]) {
    geometries.push(ring.geometry);
    diagram.add(ring);
  }
  glowing.push(photonRing, criticalRing);

  // Disco (de lado para a câmera): um anel com as cores da temperatura.
  const diskCanvas = document.createElement('canvas');
  diskCanvas.width = 256;
  diskCanvas.height = 1;
  const diskContext = diskCanvas.getContext('2d');
  if (!diskContext) throw new Error('Canvas 2D indisponível para o disco');
  for (let x = 0; x < 256; x += 1) {
    const r = ISCO_RADIUS + ((DISK_OUTER_RADIUS - ISCO_RADIUS) * x) / 255;
    const t = diskTemperature(r);
    const fade = Math.min(1, (DISK_OUTER_RADIUS - r) / (DISK_OUTER_RADIUS * 0.28));
    diskContext.fillStyle = `rgba(255, ${Math.round(120 + 120 * t)}, ${Math.round(40 + 160 * t * t)}, ${(0.25 + 0.6 * t) * fade})`;
    diskContext.fillRect(x, 0, 1, 1);
  }
  const diskTexture = new THREE.CanvasTexture(diskCanvas);
  diskTexture.colorSpace = THREE.SRGBColorSpace;
  owned.push(diskTexture);
  const diskGeometry = new THREE.RingGeometry(ISCO_RADIUS, DISK_OUTER_RADIUS, 128, 1).rotateX(-Math.PI / 2);
  // u da textura ao longo do raio.
  const diskPosition = diskGeometry.attributes.position!;
  const diskUv = diskGeometry.attributes.uv!;
  for (let i = 0; i < diskUv.count; i += 1) {
    const r = Math.hypot(diskPosition.getX(i), diskPosition.getZ(i));
    diskUv.setXY(i, (r - ISCO_RADIUS) / (DISK_OUTER_RADIUS - ISCO_RADIUS), 0.5);
  }
  geometries.push(diskGeometry);
  const diskMaterial = new THREE.MeshBasicMaterial({
    map: diskTexture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
  owned.push(diskMaterial);
  const disk = new THREE.Mesh(diskGeometry, diskMaterial);
  diagram.add(disk);

  // Leque de raios vindos da esquerda, paralelos, cada um com o seu b.
  interface FanRay {
    readonly points: THREE.Vector3[];
    readonly lengths: number[];
    readonly color: THREE.Color;
  }
  const rays: FanRay[] = [];
  const raysGeometry = new THREE.BufferGeometry();
  geometries.push(raysGeometry);
  const raysMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    toneMapped: false,
  });
  owned.push(raysMaterial);
  const rayLines = new THREE.LineSegments(raysGeometry, raysMaterial);
  diagram.add(rayLines);
  glowing.push(rayLines);

  // Fótons andando pelos raios.
  const photonsGeometry = new THREE.BufferGeometry();
  geometries.push(photonsGeometry);
  const photonsMaterial = new THREE.PointsMaterial({
    size: 0.012,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  });
  owned.push(photonsMaterial);
  const photons = new THREE.Points(photonsGeometry, photonsMaterial);
  diagram.add(photons);
  glowing.push(photons);

  const CAPTURED = new THREE.Color(0xff7a45);
  const ESCAPED = new THREE.Color(0x7fe3ff);
  const CRITICAL = new THREE.Color(0xffd36b);

  function buildFan(radius: number): void {
    rays.length = 0;
    const impacts: { b: number; color: THREE.Color }[] = [];
    for (const b of FAN_B) {
      const color = b < CRITICAL_IMPACT_PARAMETER ? CAPTURED : ESCAPED;
      impacts.push({ b, color }, { b: -b, color });
    }
    // O raio crítico, um fio acima de b_c: dá voltas na esfera de fótons.
    impacts.push({ b: CRITICAL_IMPACT_PARAMETER * (1 + 2e-5), color: CRITICAL });
    const positions: number[] = [];
    const colors: number[] = [];
    for (const { b, color } of impacts) {
      const points: THREE.Vector3[] = [];
      const side = Math.sign(b);
      traceFromInfinity(Math.abs(b), {
        step: 3e-3,
        maxPhi: 6 * Math.PI,
        onStep: (phi, u) => {
          const r = u > 1e-9 ? 1 / u : Number.POSITIVE_INFINITY;
          if (r > radius) return;
          // Vem da esquerda (x < 0) na altura y = b.
          points.push(new THREE.Vector3(-r * Math.cos(phi), side * r * Math.sin(phi), 0));
        },
      });
      if (points.length < 2) continue;
      const lengths = [0];
      for (let i = 1; i < points.length; i += 1) {
        lengths.push(lengths[i - 1]! + points[i]!.distanceTo(points[i - 1]!));
        const a = points[i - 1]!;
        const p = points[i]!;
        positions.push(a.x, a.y, a.z, p.x, p.y, p.z);
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
      rays.push({ points, lengths, color });
    }
    raysGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    raysGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    raysGeometry.computeBoundingSphere();
    const photonPositions = new Float32Array(rays.length * 3 * 3);
    const photonColors = new Float32Array(rays.length * 3 * 3);
    rays.forEach((ray, i) => {
      for (let k = 0; k < 3; k += 1) photonColors.set([ray.color.r, ray.color.g, ray.color.b], (i * 3 + k) * 3);
    });
    photonsGeometry.setAttribute('position', new THREE.BufferAttribute(photonPositions, 3));
    photonsGeometry.setAttribute('color', new THREE.BufferAttribute(photonColors, 3));
  }

  const scratch = new THREE.Vector3();
  function movePhotons(elapsed: number, radius: number): void {
    const attribute = photonsGeometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!attribute) return;
    const speed = radius * 0.32;
    rays.forEach((ray, i) => {
      const total = ray.lengths.at(-1) ?? 0;
      for (let k = 0; k < 3; k += 1) {
        const travelled = (elapsed * speed + (k / 3) * radius * 2.2 + i * 0.37) % (radius * 2.2);
        if (travelled > total) {
          attribute.setXYZ(i * 3 + k, 0, 0, -1e4);
          continue;
        }
        let j = 1;
        while (j < ray.lengths.length - 1 && ray.lengths[j]! < travelled) j += 1;
        const a = ray.points[j - 1]!;
        const b = ray.points[j]!;
        const span = ray.lengths[j]! - ray.lengths[j - 1]!;
        scratch.lerpVectors(a, b, span > 0 ? (travelled - ray.lengths[j - 1]!) / span : 0);
        attribute.setXYZ(i * 3 + k, scratch.x, scratch.y, scratch.z);
      }
    });
    attribute.needsUpdate = true;
  }

  const regionM = DIDACTIC_REGION_M;
  let didactic = false;
  // O diagrama em unidades de M, encolhido para caber na esfera.
  diagram.scale.setScalar(ORB_RADIUS / DIDACTIC_REGION_M);
  buildFan(DIDACTIC_REGION_M * 0.985);

  const anchor = (x: number, y: number): THREE.Object3D => {
    const object = new THREE.Object3D();
    object.position.set(x, y, 0);
    diagram.add(object);
    return object;
  };
  const anchors = {
    horizon: anchor(0, -HORIZON_RADIUS),
    photon: anchor(PHOTON_SPHERE_RADIUS * Math.SQRT1_2, PHOTON_SPHERE_RADIUS * Math.SQRT1_2),
    critical: anchor(0, CRITICAL_IMPACT_PARAMETER),
  };
  const worldCenter = new THREE.Vector3();

  return {
    group,
    center,
    glowing,
    anchors,

    setRegion(radiusInM: number): void {
      tracerUniforms.uScale.value = radiusInM / ORB_RADIUS;
    },

    setDidactic(on: boolean): void {
      didactic = on;
      tracer.visible = !on;
      diagram.visible = on;
    },

    setDiskVisible(on: boolean): void {
      disk.visible = on;
    },

    setSteps(count: number): void {
      if (tracerMaterial.defines['TRACE_STEPS'] === count) return;
      tracerMaterial.defines['TRACE_STEPS'] = count;
      tracerMaterial.needsUpdate = true;
    },

    update(elapsed: number): void {
      center.getWorldPosition(worldCenter);
      tracerUniforms.uCenter.value.copy(worldCenter);
      if (didactic) movePhotons(elapsed, regionM);
    },

    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const item of owned) item.dispose();
      group.clear();
    },
  };
}
