import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from './materials';
import { brushedMetalRoughness } from './textures/procedural';

/**
 * Kit de ferragens de bancada óptica (SPEC §3.1): poste de aço com suporte,
 * base e parafuso de aperto, gabinete de instrumento com cantos arredondados,
 * pés de borracha e grade de ventilação, moldura de monitor, botões,
 * conectores e parafusos.
 *
 * As peças se acumulam num `HardwareKit` por acabamento e viram **uma malha
 * por acabamento** no `build()`: um equipamento detalhado custa quatro ou
 * cinco draw calls, não dezenas (orçamento da SPEC §8).
 *
 * Unidades de cena (≈ metros). Cada construtor recebe uma pose (`at`) e monta
 * a peça no referencial dela: y para cima, frente em +z.
 */

/** Acabamentos do kit. Os três primeiros vêm da biblioteca da sala. */
export type Finish = 'anodized' | 'brass' | 'darkSteel' | 'steel' | 'rubber' | 'case' | 'chrome' | 'ceramic';

interface ExtraMaterials {
  readonly steel: THREE.MeshPhysicalMaterial;
  readonly chrome: THREE.MeshPhysicalMaterial;
  readonly rubber: THREE.MeshStandardMaterial;
  readonly case: THREE.MeshPhysicalMaterial;
  readonly ceramic: THREE.MeshPhysicalMaterial;
}

// Um conjunto por biblioteca: as bancadas trocam, os materiais ficam (como
// os da própria biblioteca, que vivem enquanto a sala existir).
const extras = new WeakMap<MaterialLibrary, ExtraMaterials>();

function extraMaterials(library: MaterialLibrary): ExtraMaterials {
  const cached = extras.get(library);
  if (cached) return cached;
  // Escovado no sentido do eixo do poste: a textura base risca em u, que no
  // cilindro dá a volta; girada 90°, os riscos correm ao longo da altura (sem
  // isso o poste parecia uma barra rosqueada).
  const brushed = brushedMetalRoughness().clone();
  brushed.center.set(0.5, 0.5);
  brushed.rotation = Math.PI / 2;
  brushed.needsUpdate = true;
  const created: ExtraMaterials = {
    // Aço inox retificado dos postes ópticos: claro, escovado no sentido do eixo.
    steel: new THREE.MeshPhysicalMaterial({
      color: 0xb4bcc6,
      metalness: 1,
      roughness: 0.34,
      roughnessMap: brushed,
      anisotropy: 0.5,
      envMapIntensity: 0.8,
    }),
    // Cromado de parafusos e conectores: reflexo nítido, pequeno na tela.
    chrome: new THREE.MeshPhysicalMaterial({ color: 0xd9dee6, metalness: 1, roughness: 0.16, envMapIntensity: 0.9 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.9, metalness: 0 }),
    // Porcelana vitrificada dos isoladores de alta tensão.
    ceramic: new THREE.MeshPhysicalMaterial({ color: 0xe9e4da, roughness: 0.28, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.12 }),
    // Gabinete de instrumento: pintura texturizada grafite-azulada, um tom
    // acima do corpo da bancada para o aparelho se destacar dele.
    case: (() => {
      const material = library.benchBody.clone();
      material.color.setHex(0x283140);
      material.clearcoat = 0.3;
      material.clearcoatRoughness = 0.35;
      return material;
    })(),
  };
  extras.set(library, created);
  return created;
}

/** Material de cada acabamento, para quem precisa pintar uma peça avulsa. */
export function hardwareMaterial(library: MaterialLibrary, finish: Finish): THREE.Material {
  switch (finish) {
    case 'anodized':
      return library.anodizedAluminum;
    case 'brass':
      return library.brushedBrass;
    case 'darkSteel':
      return library.darkSteel;
    default:
      return extraMaterials(library)[finish];
  }
}

/** Pose de uma peça: posição e giro em torno do eixo vertical. */
export function pose(x: number, y: number, z: number, rotationY = 0): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY(rotationY).setPosition(x, y, z);
}

export class HardwareKit {
  private readonly parts = new Map<Finish, THREE.BufferGeometry[]>();

  /** Acrescenta uma geometria (já posicionada no referencial `at`). */
  add(finish: Finish, geometry: THREE.BufferGeometry, at?: THREE.Matrix4): this {
    const piece = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    geometry.dispose();
    if (!piece.attributes.uv) {
      piece.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((piece.attributes.position!.count) * 2), 2));
    }
    if (at) piece.applyMatrix4(at);
    const list = this.parts.get(finish) ?? [];
    list.push(piece);
    this.parts.set(finish, list);
    return this;
  }

  /** Quantos acabamentos (logo, quantas malhas) o kit vai gerar. */
  get finishes(): number {
    return this.parts.size;
  }

  /**
   * Mescla as peças: uma geometria por acabamento. O kit fica vazio; as
   * geometrias devolvidas passam a ser de quem chamou.
   */
  merge(): Map<Finish, THREE.BufferGeometry> {
    const merged = new Map<Finish, THREE.BufferGeometry>();
    for (const [finish, pieces] of this.parts) {
      const geometry = mergeGeometries(pieces);
      for (const piece of pieces) piece.dispose();
      if (!geometry) throw new Error(`Falha ao mesclar as peças "${finish}"`);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      merged.set(finish, geometry);
    }
    this.parts.clear();
    return merged;
  }

  /**
   * Uma malha por acabamento, num grupo. As geometrias passam a pertencer ao
   * grupo; `disposeGroup` as libera.
   */
  build(library: MaterialLibrary, name: string, options: { castShadow?: boolean; receiveShadow?: boolean } = {}): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    for (const [finish, geometry] of this.merge()) {
      const mesh = new THREE.Mesh(geometry, hardwareMaterial(library, finish));
      mesh.name = `${name}-${finish}`;
      mesh.castShadow = options.castShadow ?? true;
      mesh.receiveShadow = options.receiveShadow ?? true;
      group.add(mesh);
    }
    return group;
  }
}

/**
 * Libera as geometrias de um grupo feito pelo kit (os materiais do kit são
 * compartilhados; só os marcados com `userData.disposeMaterial`, como os dos
 * LEDs, são liberados junto).
 */
export function disposeGroup(group: THREE.Object3D): void {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    (child.geometry as THREE.BufferGeometry).dispose();
    if (child.userData.disposeMaterial) (child.material as THREE.Material).dispose();
  });
  group.removeFromParent();
}

/** As geometrias das malhas de um grupo (para a lista de descarte de quem o montou). */
export function groupGeometries(group: THREE.Object3D): THREE.BufferGeometry[] {
  const list: THREE.BufferGeometry[] = [];
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) list.push(child.geometry as THREE.BufferGeometry);
  });
  return list;
}

const local = (x: number, y: number, z: number): THREE.Matrix4 => new THREE.Matrix4().makeTranslation(x, y, z);
const chain = (at: THREE.Matrix4 | undefined, inner: THREE.Matrix4): THREE.Matrix4 => (at ? at.clone().multiply(inner) : inner);

/**
 * Cabeça de parafuso Allen, virada para +z. O sextavado escuro é opcional:
 * de longe ele não aparece e custa uma malha a mais (acabamento "rubber").
 */
export function capScrew(kit: HardwareKit, at: THREE.Matrix4, radius = 0.0035, finish: Finish = 'chrome', socket = true): void {
  const head = new THREE.CylinderGeometry(radius, radius, radius * 0.9, 16).rotateX(Math.PI / 2).translate(0, 0, radius * 0.45);
  kit.add(finish, head, at);
  if (!socket) return;
  const hole = new THREE.CylinderGeometry(radius * 0.45, radius * 0.45, radius * 0.2, 6).rotateX(Math.PI / 2).translate(0, 0, radius * 0.92);
  kit.add('rubber', hole, at);
}

export interface PostOptions {
  /** Altura do topo do poste acima da base do conjunto. */
  readonly top: number;
  /** Altura do suporte (porta-poste). */
  readonly holderHeight?: number;
  /** Raio do poste de aço. */
  readonly postRadius?: number;
  /** Base aparafusada na mesa (desligue quando o conjunto vai num carrinho). */
  readonly base?: boolean;
  /** Acabamento do parafuso de aperto; `null` tira o parafuso (poste escondido). */
  readonly thumbscrew?: Finish | null;
}

/**
 * Poste óptico completo, de baixo para cima: base com dois parafusos,
 * porta-poste anodizado com o parafuso de aperto em latão na frente e o
 * poste de aço inox até `top`. Origem no pé do conjunto.
 */
export function opticalPost(kit: HardwareKit, at: THREE.Matrix4, options: PostOptions): void {
  const { top, holderHeight = 0.055, postRadius = 0.0065, base = true, thumbscrew = 'brass' } = options;
  let y = 0;
  if (base) {
    const plate = new RoundedBoxGeometry(0.07, 0.009, 0.046, 2, 0.003).translate(0, 0.0045, 0);
    kit.add('anodized', plate, at);
    for (const side of [-1, 1]) {
      const screw = new THREE.CylinderGeometry(0.0042, 0.0042, 0.003, 16).translate(side * 0.026, 0.0105, 0);
      kit.add('chrome', screw, at);
      const socket = new THREE.CylinderGeometry(0.0018, 0.0018, 0.001, 6).translate(side * 0.026, 0.0121, 0);
      kit.add('rubber', socket, at);
    }
    y = 0.009;
  }
  const holderRadius = postRadius * 1.9;
  const height = Math.min(holderHeight, Math.max(top - y - 0.01, 0.01));
  const holder = new THREE.CylinderGeometry(holderRadius, holderRadius, height, 28).translate(0, y + height / 2, 0);
  kit.add('anodized', holder, at);
  // Aro de cima do porta-poste, um pouco mais largo: pega o brilho de aresta.
  const lip = new THREE.TorusGeometry(holderRadius * 0.98, holderRadius * 0.08, 6, 28).rotateX(Math.PI / 2).translate(0, y + height, 0);
  kit.add('anodized', lip, at);
  // Parafuso de aperto: haste e cabeça serrilhada, saindo pela frente.
  if (thumbscrew) {
    const screwY = y + height * 0.72;
    const shaft = new THREE.CylinderGeometry(0.0019, 0.0019, 0.008, 10).rotateX(Math.PI / 2).translate(0, screwY, holderRadius + 0.004);
    kit.add(thumbscrew, shaft, at);
    const knob = new THREE.CylinderGeometry(0.0062, 0.0062, 0.006, 18).rotateX(Math.PI / 2).translate(0, screwY, holderRadius + 0.0095);
    kit.add(thumbscrew, knob, at);
  }
  // Poste de aço: entra no suporte e sobe até o topo.
  const postBottom = y + height * 0.4;
  const postHeight = Math.max(top - postBottom, 0.005);
  const post = new THREE.CylinderGeometry(postRadius, postRadius, postHeight, 20).translate(0, postBottom + postHeight / 2, 0);
  kit.add('steel', post, at);
}

export interface CaseOptions {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly radius?: number;
  /** Grade de ventilação nas laterais. */
  readonly vents?: boolean;
  /** Pés de borracha. */
  readonly feet?: boolean;
  /** Moldura anodizada do painel frontal (a frente fica em z = depth/2). */
  readonly frontPanel?: boolean;
  /** Alças laterais cromadas, como nos instrumentos de rack. */
  readonly handles?: boolean;
}

/**
 * Gabinete de instrumento: corpo arredondado pintado, painel frontal
 * anodizado com quatro parafusos, pés de borracha, ventilação lateral e, se
 * pedido, alças. Origem no centro da base; a frente olha para +z.
 * Devolve o z da face do painel (para quem monta telas e botões nela).
 */
export function instrumentCase(kit: HardwareKit, at: THREE.Matrix4, options: CaseOptions): { frontZ: number; bottom: number } {
  const { width, height, depth, radius = 0.01, vents = true, feet = true, frontPanel = true, handles = false } = options;
  const lift = feet ? 0.008 : 0;
  const body = new RoundedBoxGeometry(width, height, depth, 3, Math.min(radius, height / 4, width / 4)).translate(0, lift + height / 2, 0);
  kit.add('case', body, at);
  let frontZ = depth / 2;
  if (frontPanel) {
    const inset = Math.min(0.012, width * 0.04);
    const panel = new RoundedBoxGeometry(width - inset, height - inset, 0.006, 2, 0.003).translate(0, lift + height / 2, depth / 2 + 0.001);
    kit.add('anodized', panel, at);
    frontZ = depth / 2 + 0.004;
    const sx = width / 2 - inset - 0.008;
    const sy = height / 2 - inset - 0.008;
    for (const [dx, dy] of [
      [-sx, -sy],
      [sx, -sy],
      [-sx, sy],
      [sx, sy],
    ] as const) {
      capScrew(kit, chain(at, local(dx, lift + height / 2 + dy, frontZ)), 0.0028);
    }
  }
  if (feet) {
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const foot = new THREE.CylinderGeometry(0.009, 0.011, lift, 16).translate(dx * (width / 2 - 0.02), lift / 2, dz * (depth / 2 - 0.02));
      kit.add('rubber', foot, at);
    }
  }
  if (vents) {
    const slots = Math.max(3, Math.floor((depth * 0.6) / 0.012));
    for (const side of [-1, 1]) {
      for (let i = 0; i < slots; i += 1) {
        const z = -depth * 0.3 + (depth * 0.6 * i) / (slots - 1);
        const slot = new RoundedBoxGeometry(0.004, height * 0.45, 0.005, 1, 0.0018).translate(side * (width / 2 + 0.0005), lift + height * 0.55, z);
        kit.add('rubber', slot, at);
      }
    }
  }
  if (handles) {
    for (const side of [-1, 1]) {
      const bar = new THREE.CylinderGeometry(0.004, 0.004, height * 0.7, 12).translate(side * (width / 2 + 0.014), lift + height / 2, depth / 2 - 0.01);
      kit.add('chrome', bar, at);
      for (const end of [-1, 1]) {
        const arm = new THREE.CylinderGeometry(0.0035, 0.0035, 0.016, 10).rotateZ(Math.PI / 2).translate(side * (width / 2 + 0.007), lift + height / 2 + end * height * 0.33, depth / 2 - 0.01);
        kit.add('chrome', arm, at);
      }
    }
  }
  return { frontZ, bottom: lift };
}

/** Botão de painel serrilhado com saia e marca, virado para +z. */
export function panelKnob(kit: HardwareKit, at: THREE.Matrix4, radius = 0.012, finish: Finish = 'anodized'): void {
  const profile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(radius * 1.25, 0),
    new THREE.Vector2(radius * 1.25, radius * 0.18),
    new THREE.Vector2(radius, radius * 0.3),
    new THREE.Vector2(radius, radius * 1.05),
    new THREE.Vector2(radius * 0.86, radius * 1.2),
    new THREE.Vector2(0, radius * 1.22),
  ];
  const body = new THREE.LatheGeometry(profile, 28).rotateX(Math.PI / 2);
  kit.add(finish, body, at);
  // Tampa metálica e a marca de posição.
  const cap = new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, radius * 0.06, 24).rotateX(Math.PI / 2).translate(0, 0, radius * 1.24);
  kit.add('chrome', cap, at);
  const mark = new THREE.BoxGeometry(radius * 0.12, radius * 0.5, radius * 0.08).translate(0, radius * 0.62, radius * 1.24);
  kit.add('brass', mark, at);
}

/** Conector BNC de painel: porca sextavada, corpo e baioneta, virado para +z. */
export function bncJack(kit: HardwareKit, at: THREE.Matrix4, scale = 1): void {
  const s = scale;
  kit.add('chrome', new THREE.CylinderGeometry(0.0072 * s, 0.0072 * s, 0.0025 * s, 6).rotateX(Math.PI / 2).translate(0, 0, 0.0012 * s), at);
  kit.add('chrome', new THREE.CylinderGeometry(0.0048 * s, 0.0048 * s, 0.009 * s, 18).rotateX(Math.PI / 2).translate(0, 0, 0.0065 * s), at);
  kit.add('rubber', new THREE.CylinderGeometry(0.0022 * s, 0.0022 * s, 0.0012 * s, 12).rotateX(Math.PI / 2).translate(0, 0, 0.0112 * s), at);
  for (const side of [-1, 1]) {
    kit.add('chrome', new THREE.CylinderGeometry(0.0009 * s, 0.0009 * s, 0.0026 * s, 8).rotateZ(Math.PI / 2).translate(side * 0.0055 * s, 0, 0.0075 * s), at);
  }
}

/**
 * Moldura de tela (monitor, osciloscópio): anel arredondado em volta de um
 * vão `width × height`, com profundidade `depth`. A face da tela fica em z = 0;
 * a moldura avança `depth` para +z. Origem no centro da tela.
 */
export function screenBezel(
  kit: HardwareKit,
  at: THREE.Matrix4,
  options: { width: number; height: number; border: number; depth?: number; radius?: number; finish?: Finish },
): void {
  const { width, height, border, depth = 0.01, radius = border * 0.8, finish = 'anodized' } = options;
  const w = width / 2 + border;
  const h = height / 2 + border;
  const outer = roundedRect(w, h, radius);
  const hole = roundedRect(width / 2, height / 2, Math.min(radius * 0.35, border * 0.5));
  outer.holes.push(new THREE.Path(hole.getPoints(6)));
  const geometry = new THREE.ExtrudeGeometry(outer, {
    depth,
    bevelEnabled: true,
    bevelThickness: Math.min(0.003, depth * 0.3),
    bevelSize: Math.min(0.003, border * 0.3),
    bevelSegments: 2,
    curveSegments: 6,
  });
  kit.add(finish, geometry, at);
}

function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const radius = Math.min(r, w * 0.9, h * 0.9);
  const shape = new THREE.Shape();
  shape.moveTo(-w + radius, -h);
  shape.lineTo(w - radius, -h);
  shape.quadraticCurveTo(w, -h, w, -h + radius);
  shape.lineTo(w, h - radius);
  shape.quadraticCurveTo(w, h, w - radius, h);
  shape.lineTo(-w + radius, h);
  shape.quadraticCurveTo(-w, h, -w, h - radius);
  shape.lineTo(-w, -h + radius);
  shape.quadraticCurveTo(-w, -h, -w + radius, -h);
  return shape;
}

/**
 * Pé de monitor: base oval com borda de borracha e pescoço achatado até
 * `height`. Origem no centro da base, no tampo.
 */
export function monitorStand(kit: HardwareKit, at: THREE.Matrix4, options: { height: number; baseWidth?: number; baseDepth?: number }): void {
  const { height, baseWidth = 0.2, baseDepth = 0.12 } = options;
  const base = new THREE.CylinderGeometry(0.5, 0.5, 0.012, 40).scale(baseWidth, 1, baseDepth).translate(0, 0.006, 0);
  kit.add('anodized', base, at);
  const ring = new THREE.TorusGeometry(0.5, 0.012, 6, 40).rotateX(Math.PI / 2).scale(baseWidth, 1, baseDepth).translate(0, 0.002, 0);
  kit.add('rubber', ring, at);
  const neck = new RoundedBoxGeometry(0.05, height, 0.018, 2, 0.006).translate(0, height / 2 + 0.01, -baseDepth * 0.15);
  kit.add('anodized', neck, at);
  const collar = new RoundedBoxGeometry(0.07, 0.02, 0.03, 2, 0.006).translate(0, 0.02, -baseDepth * 0.15);
  kit.add('chrome', collar, at);
}

/** Etiqueta de LED: um pontinho aceso (malha avulsa, para o bloom). */
export function indicatorLed(color: THREE.ColorRepresentation, radius = 0.0028, intensity = 3): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), material);
  mesh.name = 'indicator-led';
  mesh.userData.disposeMaterial = true;
  return mesh;
}
