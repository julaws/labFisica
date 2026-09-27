import { refractiveIndex } from './glass';
import { WAVELENGTHS_NM } from './constants';
import { type Prescription, vertexPositions } from './prescription';

/**
 * Traçado de raios real, sequencial e vetorial (SPEC §5.3).
 *
 * Refração pela lei de Snell na forma vetorial:
 *
 *     t = η·i + (η·cosθi − cosθt)·n
 *
 * com η = n / n′, detecção de reflexão interna total e de vinhetagem
 * (raio que chega além do semidiâmetro é bloqueado).
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Ray {
  readonly origin: Vec3;
  readonly direction: Vec3;
}

export type BlockReason = 'vignette' | 'tir' | 'miss';

export interface TraceResult {
  /** Origem seguida de cada ponto de interseção, na ordem da luz. */
  readonly points: readonly Vec3[];
  /** Raio que sai da última superfície; ausente quando o traçado foi bloqueado. */
  readonly exit: Ray | null;
  /** Motivo e superfície onde o raio morreu, ou null se atravessou tudo. */
  readonly blocked: { reason: BlockReason; surfaceIndex: number } | null;
}

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const length = (a: Vec3): number => Math.sqrt(dot(a, a));

export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  if (l === 0) throw new Error('Não dá para normalizar um vetor nulo');
  return scale(a, 1 / l);
}

/**
 * Interseção de um raio com uma superfície esférica cujo vértice está em
 * (0, 0, vertexZ) e cujo centro está em (0, 0, vertexZ + radius).
 * `radius = Infinity` trata a superfície como plana.
 *
 * Das duas raízes, escolhemos a que fica do lado do vértice: para raio
 * positivo é a menor, para raio negativo é a maior.
 */
export function intersectSurface(ray: Ray, vertexZ: number, radius: number): Vec3 | null {
  if (!Number.isFinite(radius)) {
    if (ray.direction.z === 0) return null;
    const t = (vertexZ - ray.origin.z) / ray.direction.z;
    if (t < 0) return null;
    return add(ray.origin, scale(ray.direction, t));
  }

  const center: Vec3 = { x: 0, y: 0, z: vertexZ + radius };
  const o = sub(ray.origin, center);

  const b = dot(ray.direction, o);
  const c = dot(o, o) - radius * radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return null;

  const root = Math.sqrt(discriminant);
  const t = -b - Math.sign(radius) * root;
  if (t < 0) return null;

  return add(ray.origin, scale(ray.direction, t));
}

/** Normal da superfície no ponto, orientada contra a direção de incidência. */
function surfaceNormal(point: Vec3, vertexZ: number, radius: number, incident: Vec3): Vec3 {
  let normal: Vec3;

  if (!Number.isFinite(radius)) {
    normal = { x: 0, y: 0, z: 1 };
  } else {
    const center: Vec3 = { x: 0, y: 0, z: vertexZ + radius };
    normal = normalize(sub(point, center));
  }

  return dot(normal, incident) > 0 ? scale(normal, -1) : normal;
}

/**
 * Refração vetorial. Devolve null em reflexão interna total.
 * `n` deve estar orientada contra `incident` (como sai de `surfaceNormal`).
 */
export function refract(incident: Vec3, normal: Vec3, n1: number, n2: number): Vec3 | null {
  const eta = n1 / n2;
  const cosI = -dot(incident, normal);
  const sinT2 = eta * eta * (1 - cosI * cosI);

  if (sinT2 > 1) return null;

  const cosT = Math.sqrt(1 - sinT2);
  return normalize(add(scale(incident, eta), scale(normal, eta * cosI - cosT)));
}

/** Traça um raio por toda a prescrição. */
export function traceRay(
  prescription: Prescription,
  ray: Ray,
  wavelengthNm: number = WAVELENGTHS_NM.d,
): TraceResult {
  const surfaces = prescription.surfaces;
  const vertices = vertexPositions(surfaces);
  const points: Vec3[] = [ray.origin];

  let current: Ray = { origin: ray.origin, direction: normalize(ray.direction) };
  let nBefore = 1;

  for (let i = 0; i < surfaces.length; i += 1) {
    const surface = surfaces[i]!;
    const vertexZ = vertices[i]!;

    const hit = intersectSurface(current, vertexZ, surface.radius);
    if (!hit) {
      return { points, exit: null, blocked: { reason: 'miss', surfaceIndex: i } };
    }

    const radial = Math.hypot(hit.x, hit.y);
    if (radial > surface.semiDiameter) {
      points.push(hit);
      return { points, exit: null, blocked: { reason: 'vignette', surfaceIndex: i } };
    }

    points.push(hit);

    const nAfter = refractiveIndex(surface.material, wavelengthNm);
    const normal = surfaceNormal(hit, vertexZ, surface.radius, current.direction);
    const refracted = refract(current.direction, normal, nBefore, nAfter);

    if (!refracted) {
      return { points, exit: null, blocked: { reason: 'tir', surfaceIndex: i } };
    }

    current = { origin: hit, direction: refracted };
    nBefore = nAfter;
  }

  return { points, exit: current, blocked: null };
}

/**
 * Onde um raio cruza o eixo óptico, em z. Devolve Infinity se ele sai
 * paralelo ao eixo.
 */
export function axialCrossing(ray: Ray): number {
  const { origin, direction } = ray;
  const radial = Math.hypot(origin.x, origin.y);
  if (radial === 0) return Infinity;

  // Usa a componente radial dominante para evitar divisão por zero.
  const useY = Math.abs(origin.y) >= Math.abs(origin.x);
  const h = useY ? origin.y : origin.x;
  const slope = useY ? direction.y : direction.x;
  if (slope === 0) return Infinity;

  return origin.z - (h / slope) * direction.z;
}

/** Cria um raio vindo do infinito, paralelo ao eixo, na altura `height`. */
export function collimatedRay(height: number, startZ = -10): Ray {
  return { origin: { x: 0, y: height, z: startZ }, direction: { x: 0, y: 0, z: 1 } };
}

/**
 * Leque de raios de um ponto do objeto amostrando o anel da pupila de entrada
 * (SPEC §6.5). O ponto é dado por sua altura `objectHeight` e distância
 * `objectDistance` (positiva, à esquerda do primeiro vértice).
 */
export function pupilFan(
  objectHeight: number,
  objectDistanceMm: number,
  pupil: { z: number; diameter: number },
  count: number,
): Ray[] {
  const origin: Vec3 = { x: 0, y: objectHeight, z: -objectDistanceMm };
  const rays: Ray[] = [];
  const radius = pupil.diameter / 2;

  for (let i = 0; i < count; i += 1) {
    // Amostra o diâmetro vertical da pupila: é o corte que se desenha em 2D.
    const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
    const target: Vec3 = { x: 0, y: t * radius, z: pupil.z };
    rays.push({ origin, direction: normalize(sub(target, origin)) });
  }

  return rays;
}

export interface SphericalAberration {
  /** Altura de entrada do raio marginal, mm. */
  height: number;
  /** Onde o raio marginal cruza o eixo, medido do último vértice, mm. */
  marginalFocus: number;
  /** Onde o raio paraxial cruza o eixo, medido do último vértice, mm. */
  paraxialFocus: number;
  /**
   * Aberração esférica longitudinal, mm.
   * Negativa = subcorrigida (o raio marginal foca antes do paraxial),
   * que é o comportamento normal de uma lente positiva simples.
   */
  longitudinal: number;
}

/**
 * Mede a aberração esférica longitudinal de um objeto no infinito,
 * comparando um raio marginal com um raio quase paraxial.
 */
export function sphericalAberration(
  prescription: Prescription,
  marginalHeight: number,
  wavelengthNm: number = WAVELENGTHS_NM.d,
  paraxialHeight = 1e-3,
): SphericalAberration {
  const lastVertex = vertexPositions(prescription.surfaces).at(-1)!;

  const focusOf = (height: number): number => {
    const result = traceRay(prescription, collimatedRay(height), wavelengthNm);
    if (!result.exit) {
      throw new Error(
        `O raio de altura ${height} mm foi bloqueado (${result.blocked?.reason ?? 'desconhecido'})`,
      );
    }
    return axialCrossing(result.exit) - lastVertex;
  };

  const marginalFocus = focusOf(marginalHeight);
  const paraxialFocus = focusOf(paraxialHeight);

  return {
    height: marginalHeight,
    marginalFocus,
    paraxialFocus,
    longitudinal: marginalFocus - paraxialFocus,
  };
}
