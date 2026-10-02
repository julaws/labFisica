import * as THREE from 'three';
import { PALETTE } from '../../scene/materials';
import type { DragHandle } from '../../core/experiment';
import { type SensorRender, type SensorState, createSensorRender } from './sensor-render';

/**
 * Telas do console embutidas na bancada (SPEC §3.3 e §6.6).
 *
 * - a tela principal mostra a imagem do sensor **na orientação correta**, com
 *   a legenda "a câmera desvira a imagem" — é o que o corpo de uma câmera faz;
 * - a tira de miniaturas mostra a mesma cena focada em cinco distâncias fixas.
 *
 * As miniaturas são caras (uma renderização da cena cada), então elas só são
 * recalculadas quando algo que as afeta muda: a **abertura**. Mudar o foco não
 * as invalida, porque cada uma tem o seu foco fixo — é o cache da SPEC §6.6.
 */

/** Focos fixos da tira, em mm (SPEC §6.6). */
export const THUMBNAIL_FOCUS_MM = [300, 370, 600, 1200, 2000] as const;

export interface ConsoleScreens {
  readonly group: THREE.Group;
  /** Atualiza a tela principal e, se a abertura mudou, as miniaturas. */
  setState(state: SensorState): void;
  /** Renderiza o que estiver sujo. Chamado uma vez por quadro. */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void;
  /** Alvo de clique das miniaturas: define o foco daquela miniatura. */
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
  /** Chamado quando o usuário clica numa miniatura. */
  readonly onPickFocus: (millimeters: number) => void;
}

/**
 * Faixa horizontal, como o console da referência: a tela principal à
 * esquerda, a tira de miniaturas à direita, tudo sobre um painel escuro.
 * Proporção 3:2 do sensor full frame (36 × 24 mm) em todas as telas.
 */
// As miniaturas ficaram 3× maiores na ADR 0006 (eram 0,15 × 0,10); a tela
// principal acompanha, para não ficar menor que elas.
const MAIN = { width: 0.45, height: 0.3 };
const THUMB = { width: 0.45, height: 0.3, gap: 0.03 };
/** Espaço entre a tela principal e a tira. */
const SPLIT = 0.07;
/** Margem do painel em volta das telas. */
const BEZEL = 0.035;

export function createConsoleScreens({
  main,
  layer,
  cameraX,
  sceneUnitsPerMm,
  thumbnailSize,
  samples,
  onPickFocus,
}: ConsoleScreensOptions): ConsoleScreens {
  const group = new THREE.Group();
  group.name = 'console-screens';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const stripWidth =
    THUMBNAIL_FOCUS_MM.length * THUMB.width + (THUMBNAIL_FOCUS_MM.length - 1) * THUMB.gap;
  const totalWidth = MAIN.width + SPLIT + stripWidth;
  const left = -totalWidth / 2;

  // --- Painel escuro atrás das telas, com a legenda gravada nele -------------
  // A legenda vai na textura do painel, não numa placa própria: uma malha a
  // menos em cada passe (SPEC §8).
  const bezelWidth = totalWidth + BEZEL * 2;
  const bezelHeight = MAIN.height + 0.045 + BEZEL * 2;
  const bezelCenterY = -0.02;
  const mainCenterX = left + MAIN.width / 2;
  const captionY = -MAIN.height / 2 - 0.024;

  const bezelTexture = createBezelTexture(
    'a câmera desvira a imagem',
    bezelWidth,
    bezelHeight,
    // Centro da legenda em coordenadas do painel (0–1, origem embaixo).
    (mainCenterX + bezelWidth / 2) / bezelWidth,
    (captionY - bezelCenterY + bezelHeight / 2) / bezelHeight,
  );
  textures.push(bezelTexture);

  const bezelGeometry = new THREE.PlaneGeometry(bezelWidth, bezelHeight);
  geometries.push(bezelGeometry);
  const bezelMaterial = new THREE.MeshStandardMaterial({
    map: bezelTexture,
    roughness: 0.35,
    metalness: 0.2,
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
  // O foco de cada miniatura entra em setState; aqui só se cria o alvo.
  const thumbnails = THUMBNAIL_FOCUS_MM.map(() =>
    createSensorRender({
      layer,
      size: thumbnailSize,
      samples,
      blades: 9,
      cameraX,
      sceneUnitsPerMm,
    }),
  );

  // As câmeras das miniaturas precisam morar no mesmo grupo que a câmera
  // principal: o mapa de profundidade é medido a partir da objetiva. Soltas na
  // cena, elas ficariam na origem do mundo — no chão da sala — e sairiam pretas.
  const cameraParent = main.camera.parent;
  if (!cameraParent) {
    throw new Error('A câmera do sensor precisa estar no grupo do experimento antes do console');
  }
  for (const thumbnail of thumbnails) cameraParent.add(thumbnail.camera);

  const stripLeft = left + MAIN.width + SPLIT;

  const thumbGeometry = new THREE.PlaneGeometry(THUMB.width, THUMB.height);
  geometries.push(thumbGeometry);

  const frameGeometry = new THREE.PlaneGeometry(THUMB.width + 0.016, THUMB.height + 0.016);
  geometries.push(frameGeometry);
  const frameMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.focus });
  materials.push(frameMaterial);
  const highlight = new THREE.Mesh(frameGeometry, frameMaterial);
  highlight.position.z = -0.001;
  group.add(highlight);

  const thumbMeshes: THREE.Mesh[] = [];
  thumbnails.forEach((thumbnail, index) => {
    const material = new THREE.MeshBasicMaterial({ map: thumbnail.texture });
    materials.push(material);
    const mesh = new THREE.Mesh(thumbGeometry, material);
    mesh.position.set(stripLeft + THUMB.width / 2 + index * (THUMB.width + THUMB.gap), 0, 0);
    mesh.userData.focusMm = THUMBNAIL_FOCUS_MM[index];
    thumbMeshes.push(mesh);
    group.add(mesh);
  });

  let lastKey = '';

  return {
    group,

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

      // Destaca a miniatura de foco mais próximo do atual, em escala log.
      let best = 0;
      let bestGap = Infinity;
      THUMBNAIL_FOCUS_MM.forEach((focus, index) => {
        const target = Number.isFinite(state.focusDistance) ? state.focusDistance : 1e6;
        const gap = Math.abs(Math.log(focus) - Math.log(target));
        if (gap < bestGap) {
          bestGap = gap;
          best = index;
        }
      });
      highlight.position.x = thumbMeshes[best]!.position.x;
      highlight.position.y = thumbMeshes[best]!.position.y;
    },

    render(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
      main.render(renderer, scene);
      // No máximo uma miniatura por quadro, para não travar a interação.
      for (const thumbnail of thumbnails) {
        if (thumbnail.render(renderer, scene)) break;
      }
    },

    clickHandle: {
      targets: thumbMeshes,
      cursor: 'pointer',
      onDragStart: (event) => {
        // O ponto do clique diz qual miniatura: a mais próxima em x local.
        const local = group.worldToLocal(event.point.clone());
        let pick = thumbMeshes[0]!;
        for (const mesh of thumbMeshes) {
          if (Math.abs(mesh.position.x - local.x) < Math.abs(pick.position.x - local.x)) pick = mesh;
        }
        onPickFocus(pick.userData.focusMm as number);
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

/**
 * Painel escuro do console com a legenda gravada, em canvas. `u` e `v` são o
 * centro da legenda em coordenadas de textura (0–1, v de baixo para cima).
 */
function createBezelTexture(
  text: string,
  width: number,
  height: number,
  u: number,
  v: number,
): THREE.Texture {
  const pixelsPerUnit = 900;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * pixelsPerUnit);
  canvas.height = Math.round(height * pixelsPerUnit);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para o painel do console');

  ctx.fillStyle = '#05080e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(138, 148, 168, 0.95)';
  ctx.font = `500 ${Math.round(0.024 * pixelsPerUnit)}px Outfit, ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, u * canvas.width, (1 - v) * canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
