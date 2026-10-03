import * as THREE from 'three';
import type { DragEvent3D, DragHandle } from './experiment';

/**
 * Entrada: teclado e arraste de objetos 3D por raycast (SPEC §7).
 *
 * Quando o ponteiro desce sobre um objeto registrado, o controle de câmera é
 * desligado até soltar — senão arrastar o anel de foco orbitaria a cena junto.
 *
 * Objetos clicáveis (os quadros da parede) não seguram a câmera: um toque
 * curto, sem arrastar, é um clique; arrastar continua orbitando a cena.
 */

export interface ClickHandle {
  /** Malhas testadas pelo raycast (com os filhos). */
  readonly targets: THREE.Object3D[];
  /** Cursor CSS mostrado quando o ponteiro está sobre o alvo. */
  readonly cursor?: string;
  /**
   * Raiz da cena para o teste de oclusão: o clique só conta se o primeiro
   * objeto opaco que o raio acerta for um dos alvos (um equipamento na frente
   * do quadro não o abre).
   */
  readonly occluders?: () => THREE.Object3D;
  onClick(hit: THREE.Intersection): void;
}

export interface InputSystem {
  registerDraggable(handle: DragHandle): () => void;
  registerClickable(handle: ClickHandle): () => void;
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
  const clickables: ClickHandle[] = [];
  /** Toque em andamento que ainda pode virar clique. */
  let press: { id: number; x: number; y: number; time: number } | null = null;
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

  const isDescendant = (object: THREE.Object3D, roots: readonly THREE.Object3D[]): boolean => {
    for (let node: THREE.Object3D | null = object; node; node = node.parent) {
      if (roots.includes(node)) return true;
    }
    return false;
  };

  const isVisible = (object: THREE.Object3D): boolean => {
    for (let node: THREE.Object3D | null = object; node; node = node.parent) {
      if (!node.visible) return false;
    }
    return true;
  };

  /** Acerta um alvo clicável? Sem teste de oclusão (o hover é barato). */
  const pickClickable = (): { handle: ClickHandle; hit: THREE.Intersection } | null => {
    raycaster.setFromCamera(pointer, camera);
    for (const handle of clickables) {
      const hit = raycaster.intersectObjects(handle.targets, true).find((candidate) => isVisible(candidate.object));
      if (hit) return { handle, hit };
    }
    return null;
  };

  /** O primeiro objeto opaco no caminho do raio é um dos alvos? */
  const unobstructed = (handle: ClickHandle, hit: THREE.Intersection): boolean => {
    const root = handle.occluders?.();
    if (!root) return true;
    const first = raycaster.intersectObject(root, true).find(({ object }) => {
      if (!(object instanceof THREE.Mesh) || !isVisible(object)) return false;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      // Vidro, brilhos e ondas transparentes não tampam a vista.
      return materials.some((material: THREE.Material) => !material.transparent && material.depthWrite);
    });
    return !first || first.distance >= hit.distance - 1e-3 || isDescendant(first.object, handle.targets);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    updatePointer(event);

    const picked = pick();
    if (!picked) {
      if (clickables.length > 0) {
        press = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
      }
      return;
    }

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
    const wanted = picked ? (picked.handle.cursor ?? '') : event.buttons === 0 ? (pickClickable()?.handle.cursor ?? '') : '';

    if (Boolean(picked) !== hovering || canvas.style.cursor !== wanted) {
      hovering = Boolean(picked);
      canvas.style.cursor = wanted;
    }
  };

  const onPointerUp = (event: PointerEvent): void => {
    const pending = press;
    press = null;
    if (!pending || event.pointerId !== pending.id || event.type !== 'pointerup') return;
    // Arrastou ou segurou: era órbita, não clique.
    if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 6) return;
    if (performance.now() - pending.time > 600) return;
    updatePointer(event);
    const picked = pickClickable();
    if (picked && unobstructed(picked.handle, picked.hit)) picked.handle.onClick(picked.hit);
  };

  const endDrag = (event: PointerEvent): void => {
    onPointerUp(event);
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

    registerClickable(handle: ClickHandle): () => void {
      clickables.push(handle);
      return () => {
        const index = clickables.indexOf(handle);
        if (index >= 0) clickables.splice(index, 1);
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
      clickables.length = 0;
      keyActions.clear();
    },
  };
}
