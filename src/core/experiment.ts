import type * as THREE from 'three';
import type { MaterialLibrary } from '../scene/materials';
import type { Bench } from '../scene/bench';
import type { LabRoom } from '../scene/lab-room';
import type { QualityManager } from './quality';

/**
 * Interface de experimento e registro (SPEC §7).
 *
 * A sala e a bancada são do laboratório, não do experimento: trocar de
 * experimento não recria nem recarrega nada disso. O experimento recebe um
 * `LabContext` e monta o que é seu sobre o trilho.
 *
 * `LabContext` cresce por fase (raios na F5, etiquetas na F5, render do sensor
 * na F6). Os campos novos entram como **opcionais** para que um experimento
 * escrito antes continue compilando — é a regra 11 da CLAUDE.md na prática.
 */

export type Locale = 'pt-BR' | 'en';

export interface LabContext {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly materials: MaterialLibrary;
  readonly room: LabRoom;
  readonly bench: Bench;
  readonly quality: QualityManager;
  /** Marca objetos para receberem bloom seletivo. */
  readonly addGlow: (object: THREE.Object3D) => void;
  /** Registra um objeto como arrastável; devolve a função de remoção. */
  readonly registerDraggable: (handle: DragHandle) => () => void;
  /** Registra um atalho de teclado; devolve a função de remoção. */
  readonly onKey: (key: string, action: (event: KeyboardEvent) => void) => () => void;
  /** Pede um quadro quando o loop está em modo sob demanda. */
  readonly invalidate: () => void;
}

/** Objeto 3D que responde a arraste (anel de foco, carrinhos). */
export interface DragHandle {
  /** Malhas testadas pelo raycast. */
  readonly targets: THREE.Object3D[];
  /** Cursor CSS mostrado quando o ponteiro está sobre o alvo. */
  readonly cursor?: string;
  onDragStart?(event: DragEvent3D): void;
  onDrag(event: DragEvent3D): void;
  onDragEnd?(): void;
}

export interface DragEvent3D {
  /** Deslocamento do ponteiro desde o último quadro, em pixels. */
  readonly deltaX: number;
  readonly deltaY: number;
  /** Deslocamento acumulado desde o início do arraste, em pixels. */
  readonly totalX: number;
  readonly totalY: number;
  /** Ponto do primeiro toque no objeto, em coordenadas de mundo. */
  readonly point: THREE.Vector3;
}

/** Descrição declarativa dos controles; a UI da F7 é quem renderiza. */
export interface PanelSchema {
  readonly groups: readonly PanelGroup[];
}

export interface PanelGroup {
  readonly id: string;
  readonly label: Record<Locale, string>;
  readonly controls: readonly PanelControl[];
}

export type PanelControl =
  | { kind: 'segmented'; id: string; label: Record<Locale, string>; options: readonly { value: string | number; label: string }[] }
  | { kind: 'slider'; id: string; label: Record<Locale, string>; min: number; max: number; step: number; logarithmic?: boolean; unit?: string }
  | { kind: 'toggle'; id: string; label: Record<Locale, string> };

export interface ExperimentCopy {
  readonly title: Record<Locale, string>;
  readonly subtitle: Record<Locale, string>;
  /** Seções do modal "?" (SPEC §6.7). */
  readonly sections: readonly { id: string; heading: Record<Locale, string>; body: Record<Locale, string> }[];
}

export interface CinematicShot {
  readonly id: string;
  readonly label: Record<Locale, string>;
  readonly position: THREE.Vector3Like;
  readonly target: THREE.Vector3Like;
  readonly fov?: number;
}

export interface Experiment {
  readonly id: string;
  readonly title: Record<Locale, string>;
  setup(context: LabContext): Promise<void>;
  update(dt: number, elapsed: number): void;
  /**
   * Altera um controle pelo id declarado em `ui()`. É por aqui que o painel da
   * interface e o script de capturas mexem no estado, sem depender de
   * atalhos de teclado nem conhecer a store do experimento.
   */
  set(id: string, value: string | number | boolean): void;
  ui(): PanelSchema;
  copy(): ExperimentCopy;
  cameras(): CinematicShot[];
  dispose(): void;
}

/** Registro de experimentos, endereçado por hash (#/lens-focus). */
export interface ExperimentDescriptor {
  readonly id: string;
  readonly title: Record<Locale, string>;
  readonly create: () => Experiment;
}

export interface ExperimentRegistry {
  register(descriptor: ExperimentDescriptor): void;
  list(): { id: string; title: Record<Locale, string> }[];
  create(id: string): Experiment | null;
  /** Primeiro experimento registrado, usado quando o hash não casa. */
  createDefault(): Experiment | null;
}

export function createExperimentRegistry(): ExperimentRegistry {
  const factories = new Map<string, () => Experiment>();
  const titles = new Map<string, Record<Locale, string>>();
  const order: string[] = [];

  return {
    register({ id, title, create }: ExperimentDescriptor): void {
      if (factories.has(id)) throw new Error(`Experimento duplicado: ${id}`);
      factories.set(id, create);
      titles.set(id, title);
      order.push(id);
    },
    list(): { id: string; title: Record<Locale, string> }[] {
      return order.map((id) => ({ id, title: titles.get(id)! }));
    },
    create(id: string): Experiment | null {
      const factory = factories.get(id);
      return factory ? factory() : null;
    },
    createDefault(): Experiment | null {
      const first = order[0];
      return first ? factories.get(first)!() : null;
    },
  };
}

/** Lê o id do experimento do hash da URL (#/lens-focus). */
export function experimentIdFromHash(hash: string = window.location.hash): string | null {
  const match = /^#\/([\w-]+)/.exec(hash);
  return match?.[1] ?? null;
}
