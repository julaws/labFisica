import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { F_STOP_PRESETS } from '../../optics/constants';
import { PALETTE } from '../../scene/materials';
import type { DragHandle } from '../../core/experiment';
import { type SensorRender, type SensorState, createSensorRender } from './sensor-render';

/**
 * Telas do console embutidas na bancada (SPEC §3.3 e §6.6), no desenho da
 * referência (sael.net/plane-of-focus):
 *
 * - a tela principal mostra a imagem do sensor **na orientação correta**, com
 *   a legenda "a câmera desvira a imagem" — é o que o corpo de uma câmera faz;
 * - a tira de miniaturas mostra a mesma cena focada em cinco distâncias fixas;
 *   a do foco atual ganha uma moldura neon azul, que brilha;
 * - embaixo da tira, uma régua com um trilho aceso e um cursor que acompanha a
 *   miniatura selecionada, e setas ‹ › que passam para a vizinha;
 * - à direita, os três diafragmas de atalho (f/2, f/5,6, f/16): o da abertura
 *   atual ganha um aro dourado e uma luz embaixo;
 * - gravado no painel, o crédito à referência que inspirou este experimento.
 *
 * As miniaturas são caras (uma renderização da cena cada), então elas só são
 * recalculadas quando algo que as afeta muda: a **abertura**. Mudar o foco não
 * as invalida, porque cada uma tem o seu foco fixo — é o cache da SPEC §6.6.
 */

/** Focos fixos da tira, em mm (SPEC §6.6). */
export const THUMBNAIL_FOCUS_MM = [300, 370, 600, 1200, 2000] as const;

/** Crédito gravado no console. */
export const CONSOLE_CREDIT = {
  'pt-BR': 'Inspirado em “The Plane of Focus” · sael.net/plane-of-focus · @ryansael',
  en: 'Inspired by “The Plane of Focus” · sael.net/plane-of-focus · @ryansael',
} as const;

export interface ConsoleScreens {
  readonly group: THREE.Group;
  /** Moldura da miniatura, trilho da régua e aros: entram no bloom. */
  readonly glowing: THREE.Object3D[];
  /** Atualiza a tela principal e, se a abertura mudou, as miniaturas. */
  setState(state: SensorState): void;
  /** Renderiza o que estiver sujo. Chamado uma vez por quadro. */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void;
  /** Alvo de clique: miniaturas, setas e diafragmas. */
  readonly clickHandle: DragHandle;
  dispose(): void;
}

export interface ConsoleScreensOptions {
  readonly main: SensorRender;
  readonly layer: number;
  readonly cameraX: number;
  readonly sceneUnitsPerMm: number;
  readonly thumbnailSize: number;
  readonly samples: number;
  /** Texto da legenda e do crédito, no idioma da interface. */
  readonly locale: 'pt-BR' | 'en';
  /** Clique numa miniatura ou numa seta: o foco daquela miniatura. */
  readonly onPickFocus: (millimeters: number) => void;
  /** Clique num dos diafragmas de atalho. */
  readonly onPickAperture: (fNumber: number) => void;
}

// Proporção 3:2 do sensor full frame (36 × 24 mm) em todas as telas. As
// miniaturas encolheram um pouco para caber o painel dos diafragmas à direita.
const MAIN = { width: 0.38, height: 0.38 * (2 / 3) };
const THUMB = { width: 0.38, height: 0.38 * (2 / 3), gap: 0.026 };
/** Espaço entre blocos (tela principal, tira, diafragmas). */
const SPLIT = 0.055;
/** Painel dos diafragmas. */
const APERTURE = { width: 0.45, disc: 0.118, pitch: 0.145 };
/** Margem do painel em volta de tudo. */
const BEZEL = 0.035;
/** Régua: altura do centro abaixo das telas. */
const RULER_Y = -THUMB.height / 2 - 0.058;
const CREDIT_Y = RULER_Y - 0.06;

export function createConsoleScreens({
  main,
  layer,
  cameraX,
  sceneUnitsPerMm,
  thumbnailSize,
  samples,
  locale,
  onPickFocus,
  onPickAperture,
}: ConsoleScreensOptions): ConsoleScreens {
  const group = new THREE.Group();
  group.name = 'console-screens';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const glowing: THREE.Object3D[] = [];

  const count = THUMBNAIL_FOCUS_MM.length;
  const stripWidth = count * THUMB.width + (count - 1) * THUMB.gap;
  const totalWidth = MAIN.width + SPLIT + stripWidth + SPLIT + APERTURE.width;
  const left = -totalWidth / 2;
  const mainCenterX = left + MAIN.width / 2;
  const stripLeft = left + MAIN.width + SPLIT;
  const stripRight = stripLeft + stripWidth;
  const thumbX = (index: number): number => stripLeft + THUMB.width / 2 + index * (THUMB.width + THUMB.gap);
  const apertureCenterX = stripRight + SPLIT + APERTURE.width / 2;
  const discX = (index: number): number => apertureCenterX + (index - 1) * APERTURE.pitch;

  // --- Painel escuro com tudo o que é gravado -----------------------------------
  // Legenda, régua, rótulos dos diafragmas e crédito vão na textura do painel:
  // uma malha só em cada passe (SPEC §8).
  const top = THUMB.height / 2 + BEZEL;
  const bottom = CREDIT_Y - 0.03;
  const bezelWidth = totalWidth + BEZEL * 2;
  const bezelHeight = top - bottom;
  const bezelCenterY = (top + bottom) / 2;
  const bezelTexture = createBezelTexture({
    width: bezelWidth,
    height: bezelHeight,
    centerY: bezelCenterY,
    caption: { text: locale === 'en' ? 'the camera flips the image' : 'a câmera desvira a imagem', x: mainCenterX, y: -MAIN.height / 2 - 0.024 },
    ruler: { from: stripLeft, to: stripRight, y: RULER_Y, marks: THUMBNAIL_FOCUS_MM.map((_, index) => thumbX(index)) },
    insets: [
      { x: (stripLeft + stripRight) / 2, y: (top - BEZEL + RULER_Y - 0.03) / 2, width: stripWidth + 0.03, height: top - BEZEL - RULER_Y + 0.05 },
      { x: apertureCenterX, y: -0.02, width: APERTURE.width, height: THUMB.height + 0.09 },
    ],
    labels: F_STOP_PRESETS.map((stop, index) => ({
      text: `ƒ/${String(stop).replace('.', locale === 'en' ? '.' : ',')}`,
      x: discX(index),
      y: -APERTURE.disc / 2 - 0.05,
    })),
    credit: { text: CONSOLE_CREDIT[locale], x: (stripLeft + stripRight) / 2, y: CREDIT_Y },
  });
  textures.push(bezelTexture);

  const bezelGeometry = new THREE.PlaneGeometry(bezelWidth, bezelHeight);
  geometries.push(bezelGeometry);
  const bezelMaterial = new THREE.MeshPhysicalMaterial({
    map: bezelTexture,
    roughness: 0.3,
    metalness: 0.25,
    clearcoat: 0.6,
    clearcoatRoughness: 0.15,
  });
  materials.push(bezelMaterial);
  const bezel = new THREE.Mesh(bezelGeometry, bezelMaterial);
  bezel.position.set(0, bezelCenterY, -0.004);
  group.add(bezel);

  // --- Tela principal, na orientação correta --------------------------------
  const mainGeometry = new THREE.PlaneGeometry(MAIN.width, MAIN.height);
  geometries.push(mainGeometry);
  const mainMaterial = new THREE.MeshBasicMaterial({ map: main.texture });
  materials.push(mainMaterial);
  const mainScreen = new THREE.Mesh(mainGeometry, mainMaterial);
  mainScreen.position.set(mainCenterX, 0, 0);
  group.add(mainScreen);

  // --- Tira de miniaturas ----------------------------------------------------
  const thumbnails = THUMBNAIL_FOCUS_MM.map(() =>
    createSensorRender({ layer, size: thumbnailSize, samples, blades: 9, cameraX, sceneUnitsPerMm }),
  );
  // As câmeras das miniaturas precisam morar no mesmo grupo que a câmera
  // principal: o mapa de profundidade é medido a partir da objetiva.
  const cameraParent = main.camera.parent;
  if (!cameraParent) {
    throw new Error('A câmera do sensor precisa estar no grupo do experimento antes do console');
  }
  for (const thumbnail of thumbnails) cameraParent.add(thumbnail.camera);

  const thumbGeometry = new THREE.PlaneGeometry(THUMB.width, THUMB.height);
  geometries.push(thumbGeometry);
  const thumbMeshes: THREE.Mesh[] = [];
  thumbnails.forEach((thumbnail, index) => {
    const material = new THREE.MeshBasicMaterial({ map: thumbnail.texture });
    materials.push(material);
    const mesh = new THREE.Mesh(thumbGeometry, material);
    mesh.position.set(thumbX(index), 0, 0);
    mesh.userData.pick = { kind: 'focus', millimeters: THUMBNAIL_FOCUS_MM[index] };
    thumbMeshes.push(mesh);
    group.add(mesh);
  });

  // Moldura neon da miniatura do foco atual: um aro fino aceso e um halo que
  // se espalha em volta (textura com degradê, mistura aditiva) — com o bloom,
  // é o brilho azul da referência.
  const neonTexture = neonFrameTexture();
  textures.push(neonTexture);
  const halo = 0.06;
  const neonGeometry = new THREE.PlaneGeometry(THUMB.width + halo * 2, THUMB.height + halo * 2);
  geometries.push(neonGeometry);
  const neonMaterial = new THREE.MeshBasicMaterial({
    map: neonTexture,
    color: new THREE.Color(PALETTE.focus).multiplyScalar(3.2),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  materials.push(neonMaterial);
  const highlight = new THREE.Mesh(neonGeometry, neonMaterial);
  highlight.name = 'thumbnail-neon';
  highlight.position.z = 0.002;
  group.add(highlight);
  glowing.push(highlight);

  // --- Régua: trilho aceso, cursor e setas --------------------------------------
  const track = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 0.007).translate(0.5, 0, 0),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.focus).multiplyScalar(2.8), toneMapped: false }),
  );
  geometries.push(track.geometry);
  materials.push(track.material);
  track.name = 'ruler-track';
  track.position.set(stripLeft, RULER_Y, 0.001);
  group.add(track);
  glowing.push(track);

  // Cursor: um botão de aço escovado com um triângulo aceso embaixo.
  const cursor = new THREE.Group();
  cursor.name = 'ruler-cursor';
  const knobGeometry = new THREE.CylinderGeometry(0.016, 0.016, 0.05, 32);
  geometries.push(knobGeometry);
  const steel = new THREE.MeshStandardMaterial({ color: 0xd5d9e0, metalness: 1, roughness: 0.25 });
  materials.push(steel);
  const knob = new THREE.Mesh(knobGeometry, steel);
  knob.position.z = 0.016;
  cursor.add(knob);
  const pointerGeometry = new THREE.ConeGeometry(0.008, 0.013, 3).rotateZ(Math.PI);
  pointerGeometry.translate(0, -0.042, 0.004);
  geometries.push(pointerGeometry);
  const pointer = new THREE.Mesh(pointerGeometry, track.material);
  cursor.add(pointer);
  glowing.push(pointer);
  cursor.position.set(stripLeft, RULER_Y, 0);
  group.add(cursor);

  // Setas ‹ › nas pontas da régua: chevrons acesos, clicáveis.
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0.012, 0.03);
  arrowShape.lineTo(-0.014, 0);
  arrowShape.lineTo(0.012, -0.03);
  arrowShape.lineTo(0.018, -0.024);
  arrowShape.lineTo(-0.0005, 0);
  arrowShape.lineTo(0.018, 0.024);
  arrowShape.closePath();
  const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
  geometries.push(arrowGeometry);
  // Alvo de clique maior que o desenho.
  const arrowHitGeometry = new THREE.PlaneGeometry(0.07, 0.08);
  geometries.push(arrowHitGeometry);
  const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  materials.push(hitMaterial);
  const arrows = [-1, 1].map((direction) => {
    const arrow = new THREE.Mesh(arrowGeometry, track.material);
    // O desenho aponta para a esquerda: a seta da direita é o espelho.
    arrow.scale.x = -direction;
    const hit = new THREE.Mesh(arrowHitGeometry, hitMaterial);
    hit.userData.pick = { kind: 'step', direction };
    const holder = new THREE.Group();
    holder.add(arrow, hit);
    holder.position.set(direction < 0 ? stripLeft - 0.045 : stripRight + 0.045, RULER_Y, 0.002);
    group.add(holder);
    glowing.push(arrow);
    return hit;
  });

  // --- Diafragmas de atalho -------------------------------------------------------
  const discGeometry = new THREE.CircleGeometry(APERTURE.disc / 2, 64);
  geometries.push(discGeometry);
  const discMeshes = F_STOP_PRESETS.map((stop, index) => {
    const texture = irisIconTexture(stop);
    textures.push(texture);
    const material = new THREE.MeshStandardMaterial({ map: texture, metalness: 0.6, roughness: 0.3 });
    materials.push(material);
    const mesh = new THREE.Mesh(discGeometry, material);
    mesh.position.set(discX(index), 0.01, 0.001);
    mesh.userData.pick = { kind: 'aperture', fNumber: stop };
    group.add(mesh);
    return mesh;
  });
  // O atual: aro dourado aceso e uma barrinha de luz embaixo.
  const ringParts = [
    new THREE.RingGeometry(APERTURE.disc / 2 + 0.006, APERTURE.disc / 2 + 0.012, 64),
    new THREE.PlaneGeometry(0.05, 0.007).translate(0, -APERTURE.disc / 2 - 0.026, 0),
  ];
  const ringGeometry = mergeGeometries(ringParts);
  for (const part of ringParts) part.dispose();
  if (!ringGeometry) throw new Error('Falha ao montar o aro do diafragma');
  geometries.push(ringGeometry);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb45c).multiplyScalar(3), toneMapped: false });
  materials.push(ringMaterial);
  const apertureMark = new THREE.Mesh(ringGeometry, ringMaterial);
  apertureMark.name = 'aperture-mark';
  apertureMark.position.set(discX(0), 0.01, 0.002);
  group.add(apertureMark);
  glowing.push(apertureMark);

  let lastKey = '';
  let selected = 0;

  /** Índice da miniatura de foco mais próximo do atual, em escala log. */
  const nearestThumbnail = (focus: number): number => {
    let best = 0;
    let bestGap = Infinity;
    THUMBNAIL_FOCUS_MM.forEach((value, index) => {
      const gap = Math.abs(Math.log(value) - Math.log(focus));
      if (gap < bestGap) {
        bestGap = gap;
        best = index;
      }
    });
    return best;
  };

  /** Posição do cursor na régua: interpola em log entre os centros das miniaturas. */
  const cursorX = (focus: number): number => {
    const logs = THUMBNAIL_FOCUS_MM.map((value) => Math.log(value));
    const at = Math.log(focus);
    if (at <= logs[0]!) return thumbX(0);
    for (let i = 1; i < logs.length; i += 1) {
      if (at <= logs[i]!) {
        const t = (at - logs[i - 1]!) / (logs[i]! - logs[i - 1]!);
        return thumbX(i - 1) + t * (thumbX(i) - thumbX(i - 1));
      }
    }
    return thumbX(logs.length - 1);
  };

  const targets = [...thumbMeshes, ...arrows, ...discMeshes];

  return {
    group,
    glowing,

    setState(state: SensorState): void {
      main.setState(state);

      // Só a abertura e a objetiva invalidam as miniaturas: cada uma tem
      // foco próprio.
      const key = `${state.fNumber}|${state.focalLength}|${state.aberrationMm}`;
      if (key !== lastKey) {
        lastKey = key;
        thumbnails.forEach((thumbnail, index) => {
          thumbnail.setState({ ...state, focusDistance: THUMBNAIL_FOCUS_MM[index]! });
        });
      }

      const focus = Number.isFinite(state.focusDistance) ? state.focusDistance : 1e6;
      selected = nearestThumbnail(focus);
      highlight.position.x = thumbX(selected);
      const x = cursorX(focus);
      cursor.position.x = x;
      track.scale.x = Math.max(x - stripLeft, 1e-4);

      // Diafragma de atalho mais próximo da abertura atual, em escala log.
      let stopIndex = 0;
      let stopGap = Infinity;
      F_STOP_PRESETS.forEach((stop, index) => {
        const gap = Math.abs(Math.log(stop) - Math.log(state.fNumber));
        if (gap < stopGap) {
          stopGap = gap;
          stopIndex = index;
        }
      });
      apertureMark.position.x = discX(stopIndex);
    },

    render(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
      main.render(renderer, scene);
      // No máximo uma miniatura por quadro, para não travar a interação.
      for (const thumbnail of thumbnails) {
        if (thumbnail.render(renderer, scene)) break;
      }
    },

    clickHandle: {
      targets,
      cursor: 'pointer',
      onDragStart: (event) => {
        // O alvo é o plano que contém o ponto do clique.
        const hit = targets.find((mesh) => {
          const local = mesh.worldToLocal(event.point.clone());
          const size = (mesh.geometry as THREE.PlaneGeometry | THREE.CircleGeometry).parameters as {
            width?: number;
            height?: number;
            radius?: number;
          };
          if (size.radius !== undefined) return Math.hypot(local.x, local.y) <= size.radius + 1e-3;
          return Math.abs(local.x) <= (size.width ?? 0) / 2 + 1e-3 && Math.abs(local.y) <= (size.height ?? 0) / 2 + 1e-3;
        });
        const pick = hit?.userData.pick as
          | { kind: 'focus'; millimeters: number }
          | { kind: 'step'; direction: number }
          | { kind: 'aperture'; fNumber: number }
          | undefined;
        if (!pick) return;
        if (pick.kind === 'focus') onPickFocus(pick.millimeters);
        else if (pick.kind === 'step') {
          const next = Math.min(Math.max(selected + pick.direction, 0), count - 1);
          onPickFocus(THUMBNAIL_FOCUS_MM[next]!);
        } else onPickAperture(pick.fNumber);
      },
      onDrag: () => undefined,
    },

    dispose(): void {
      for (const thumbnail of thumbnails) {
        thumbnail.camera.removeFromParent();
        thumbnail.dispose();
      }
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      group.clear();
    },
  };
}

interface BezelSpec {
  readonly width: number;
  readonly height: number;
  /** Centro do painel em y, no referencial do console. */
  readonly centerY: number;
  readonly caption: { readonly text: string; readonly x: number; readonly y: number };
  readonly ruler: { readonly from: number; readonly to: number; readonly y: number; readonly marks: readonly number[] };
  /** Rebaixos mais escuros (atrás da tira e dos diafragmas). */
  readonly insets: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[];
  readonly labels: readonly { readonly text: string; readonly x: number; readonly y: number }[];
  readonly credit: { readonly text: string; readonly x: number; readonly y: number };
}

/** Painel escuro do console, com tudo o que é gravado nele, em canvas. */
function createBezelTexture(spec: BezelSpec): THREE.Texture {
  const pixelsPerUnit = 1100;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(spec.width * pixelsPerUnit);
  canvas.height = Math.round(spec.height * pixelsPerUnit);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para o painel do console');

  // Do referencial do console (centro das telas na origem) para pixels.
  const px = (x: number): number => (x + spec.width / 2) * pixelsPerUnit;
  const py = (y: number): number => (spec.centerY + spec.height / 2 - y) * pixelsPerUnit;
  const size = (units: number): number => units * pixelsPerUnit;

  const base = ctx.createLinearGradient(0, 0, 0, canvas.height);
  base.addColorStop(0, '#0b0f17');
  base.addColorStop(1, '#05070c');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Rebaixos: cantos arredondados, um tom mais escuro, filete claro em cima.
  for (const inset of spec.insets) {
    const x = px(inset.x - inset.width / 2);
    const y = py(inset.y + inset.height / 2);
    const w = size(inset.width);
    const h = size(inset.height);
    const r = size(0.02);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = '#03050a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(160, 175, 200, 0.16)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Régua: linha de base e marcas; as longas nos centros das miniaturas.
  ctx.strokeStyle = 'rgba(150, 165, 190, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px(spec.ruler.from), py(spec.ruler.y));
  ctx.lineTo(px(spec.ruler.to), py(spec.ruler.y));
  ctx.stroke();
  const ticks = 60;
  for (let i = 0; i <= ticks; i += 1) {
    const x = spec.ruler.from + ((spec.ruler.to - spec.ruler.from) * i) / ticks;
    const long = i % 5 === 0;
    ctx.beginPath();
    ctx.moveTo(px(x), py(spec.ruler.y + 0.004));
    ctx.lineTo(px(x), py(spec.ruler.y + (long ? 0.022 : 0.012)));
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(127, 227, 255, 0.55)';
  for (const x of spec.ruler.marks) {
    ctx.beginPath();
    ctx.moveTo(px(x), py(spec.ruler.y - 0.006));
    ctx.lineTo(px(x), py(spec.ruler.y + 0.03));
    ctx.stroke();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(138, 148, 168, 0.95)';
  ctx.font = `500 ${Math.round(size(0.021))}px Outfit, ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(spec.caption.text, px(spec.caption.x), py(spec.caption.y));

  ctx.font = `500 ${Math.round(size(0.02))}px 'DM Mono', ui-monospace, monospace`;
  ctx.fillStyle = 'rgba(200, 190, 170, 0.85)';
  for (const label of spec.labels) ctx.fillText(label.text, px(label.x), py(label.y));

  // Crédito: discreto, como as gravações do painel da referência.
  ctx.font = `500 ${Math.round(size(0.02))}px 'DM Mono', ui-monospace, monospace`;
  ctx.fillStyle = 'rgba(170, 180, 200, 0.85)';
  ctx.fillText(spec.credit.text, px(spec.credit.x), py(spec.credit.y));

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Moldura neon: um aro fino e um halo em degradê para fora, em branco (a cor
 * vem do material). O miolo é transparente para a miniatura aparecer.
 */
function neonFrameTexture(): THREE.Texture {
  const width = 512;
  const height = Math.round((512 * (THUMB.height + 0.12)) / (THUMB.width + 0.12));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para a moldura');
  const scale = width / (THUMB.width + 0.12);
  const inner = { x: 0.06 * scale, y: 0.06 * scale, w: THUMB.width * scale, h: THUMB.height * scale };
  // Halo: várias bordas cada vez mais largas e fracas.
  for (let i = 14; i >= 1; i -= 1) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.05 * (1 - i / 15)})`;
    ctx.lineWidth = i * 4;
    ctx.beginPath();
    ctx.roundRect(inner.x, inner.y, inner.w, inner.h, 10);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(inner.x, inner.y, inner.w, inner.h, 8);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Ícone de diafragma de 9 lâminas para um número f, num disco metálico. */
function irisIconTexture(fNumber: number): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para o ícone do diafragma');
  const c = size / 2;
  // Disco de aço escovado, com borda clara.
  const metal = ctx.createRadialGradient(c * 0.8, c * 0.7, 10, c, c, c);
  metal.addColorStop(0, '#e8ebf0');
  metal.addColorStop(0.7, '#a9afb8');
  metal.addColorStop(1, '#6f747c');
  ctx.fillStyle = metal;
  ctx.beginPath();
  ctx.arc(c, c, c - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#16191f';
  ctx.beginPath();
  ctx.arc(c, c, c * 0.8, 0, Math.PI * 2);
  ctx.fill();
  // Abertura: nonágono com raio proporcional a 2/N (f/2 é a maior).
  const opening = c * 0.72 * Math.min(1, 2 / fNumber) ** 0.75;
  ctx.fillStyle = '#f2f4f8';
  ctx.beginPath();
  for (let i = 0; i < 9; i += 1) {
    const angle = (i / 9) * Math.PI * 2 - Math.PI / 2;
    const x = c + opening * Math.cos(angle);
    const y = c + opening * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  // Lâminas: arestas curvas saindo de cada vértice.
  ctx.strokeStyle = 'rgba(120, 128, 140, 0.9)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 9; i += 1) {
    const angle = (i / 9) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(c + opening * Math.cos(angle), c + opening * Math.sin(angle));
    ctx.quadraticCurveTo(
      c + c * 0.6 * Math.cos(angle + 0.5),
      c + c * 0.6 * Math.sin(angle + 0.5),
      c + c * 0.8 * Math.cos(angle + 0.9),
      c + c * 0.8 * Math.sin(angle + 0.9),
    );
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
