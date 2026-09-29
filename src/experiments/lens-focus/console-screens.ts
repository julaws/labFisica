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

const MAIN = { width: 0.3, height: 0.2 };
const THUMB = { width: 0.105, height: 0.07, gap: 0.014 };

/** Altura local da tela principal dentro do grupo do console. */
const MAIN_Y = 0.06;

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

  // --- Tela principal, na orientação correta --------------------------------
  const mainGeometry = new THREE.PlaneGeometry(MAIN.width, MAIN.height);
  geometries.push(mainGeometry);
  const mainMaterial = new THREE.MeshBasicMaterial({ map: main.texture });
  materials.push(mainMaterial);
  const mainScreen = new THREE.Mesh(mainGeometry, mainMaterial);
  mainScreen.position.y = MAIN_Y;
  group.add(mainScreen);

  const caption = createCaption('a câmera desvira a imagem');
  textures.push(caption.texture);
  materials.push(caption.material);
  geometries.push(caption.geometry);
  caption.mesh.position.set(0, MAIN_Y - MAIN.height / 2 - 0.018, 0);
  group.add(caption.mesh);

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

  // Com o grupo deitado, y local positivo aponta para o fundo da bancada,
  // onde está o trilho. A tira vai para y negativo: mais perto de quem olha.
  const stripY = MAIN_Y - MAIN.height / 2 - 0.05 - THUMB.height / 2;
  const stripWidth = THUMBNAIL_FOCUS_MM.length * THUMB.width + (THUMBNAIL_FOCUS_MM.length - 1) * THUMB.gap;

  const thumbGeometry = new THREE.PlaneGeometry(THUMB.width, THUMB.height);
  geometries.push(thumbGeometry);

  const frameGeometry = new THREE.PlaneGeometry(THUMB.width + 0.008, THUMB.height + 0.008);
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
    mesh.position.set(
      -stripWidth / 2 + THUMB.width / 2 + index * (THUMB.width + THUMB.gap),
      stripY,
      0,
    );
    mesh.userData.focusMm = THUMBNAIL_FOCUS_MM[index];
    thumbMeshes.push(mesh);
    group.add(mesh);
  });

  let lastFNumber = Number.NaN;

  return {
    group,

    setState(state: SensorState): void {
      main.setState(state);

      // Só a abertura invalida as miniaturas: cada uma tem foco próprio.
      if (state.fNumber !== lastFNumber) {
        lastFNumber = state.fNumber;
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

/** Legenda em canvas, com a tipografia da interface. */
function createCaption(text: string): {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  texture: THREE.Texture;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para a legenda');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(138, 148, 168, 0.95)';
  ctx.font = '600 26px Manrope, ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  const geometry = new THREE.PlaneGeometry(0.3, 0.3 * (48 / 512));
  return { mesh: new THREE.Mesh(geometry, material), geometry, material, texture };
}
