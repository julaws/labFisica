import * as THREE from 'three';
import type { DragEvent3D, DragHandle } from './experiment';

/**
 * Entrada: teclado e arraste de objetos 3D por raycast (SPEC §7).
 *
 * Quando o ponteiro desce sobre um objeto registrado, o controle de câmera é
 * desligado até soltar — senão arrastar o anel de foco orbitaria a cena junto.
 */

export interface InputSystem {
  registerDraggable(handle: DragHandle): () => void;
  /** Registra um atalho. Devolve a função de remoção. */
  onKey(key: string, action: (event: KeyboardEvent) => void): () => void;
  /** True enquanto algum arraste 3D está ativo. */
  readonly dragging: boolean;
  dispose(): void;
}

export interface InputOptions {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  /** Liga e desliga o controle de câmera durante o arraste. */
  setCameraEnabled: (enabled: boolean) => void;
}

export function createInputSystem({ canvas, camera, setCameraEnabled }: InputOptions): InputSystem {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const handles: DragHandle[] = [];
  const keyActions = new Map<string, Set<(event: KeyboardEvent) => void>>();

  let active: DragHandle | null = null;
  let activePointerId: number | null = null;
  let lastX = 0;
  let lastY = 0;
  let startX = 0;
  let startY = 0;
  let hovering = false;

  const updatePointer = (event: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  };

  const pick = (): { handle: DragHandle; point: THREE.Vector3 } | null => {
    raycaster.setFromCamera(pointer, camera);

    for (const handle of handles) {
      const hits = raycaster.intersectObjects(handle.targets, true);
      const hit = hits[0];
      if (hit) return { handle, point: hit.point };
    }

    return null;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    updatePointer(event);

    const picked = pick();
    if (!picked) return;

    event.preventDefault();
    active = picked.handle;
    activePointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    startX = event.clientX;
    startY = event.clientY;

    canvas.setPointerCapture(event.pointerId);
    setCameraEnabled(false);
    active.onDragStart?.(makeEvent(event, picked.point));
  };

  const makeEvent = (event: PointerEvent, point: THREE.Vector3): DragEvent3D => ({
    deltaX: event.clientX - lastX,
    deltaY: event.clientY - lastY,
    totalX: event.clientX - startX,
    totalY: event.clientY - startY,
    point,
  });

  const onPointerMove = (event: PointerEvent): void => {
    if (active && event.pointerId === activePointerId) {
      const dragEvent = makeEvent(event, new THREE.Vector3());
      lastX = event.clientX;
      lastY = event.clientY;
      active.onDrag(dragEvent);
      return;
    }

    // Sem arraste ativo: só atualiza o cursor.
    updatePointer(event);
    const picked = pick();
    const wanted = picked?.handle.cursor ?? '';

    if (Boolean(picked) !== hovering || canvas.style.cursor !== wanted) {
      hovering = Boolean(picked);
      canvas.style.cursor = wanted;
    }
  };

  const endDrag = (event: PointerEvent): void => {
    if (!active || event.pointerId !== activePointerId) return;
    active.onDragEnd?.();
    active = null;
    activePointerId = null;
    canvas.releasePointerCapture?.(event.pointerId);
    setCameraEnabled(true);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    // Não sequestra o teclado quando o foco está num controle da interface.
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

    const actions = keyActions.get(event.key.toLowerCase());
    if (!actions) return;
    for (const action of actions) action(event);
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  window.addEventListener('keydown', onKeyDown);

  return {
    registerDraggable(handle: DragHandle): () => void {
      handles.push(handle);
      return () => {
        const index = handles.indexOf(handle);
        if (index >= 0) handles.splice(index, 1);
      };
    },

    onKey(key: string, action: (event: KeyboardEvent) => void): () => void {
      const normalized = key.toLowerCase();
      let actions = keyActions.get(normalized);
      if (!actions) {
        actions = new Set();
        keyActions.set(normalized, actions);
      }
      actions.add(action);
      return () => actions.delete(action);
    },

    get dragging(): boolean {
      return active !== null;
    },

    dispose(): void {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endDrag);
      canvas.removeEventListener('pointercancel', endDrag);
      window.removeEventListener('keydown', onKeyDown);
      handles.length = 0;
      keyActions.clear();
    },
  };
}
