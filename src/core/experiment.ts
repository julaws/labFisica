import type * as THREE from 'three';
import type { MaterialLibrary } from '../scene/materials';
import type { Bench } from '../scene/bench';
import type { LabRoom } from '../scene/lab-room';
import type { QualityManager } from './quality';
import type { LabelLayer } from '../scene/labels';

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
  /** Etiquetas 3D projetadas na tela (SPEC §3.3). */
  readonly labels: LabelLayer;
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
  /** Dica curta ao lado do rótulo, como os atalhos ("arraste o anel · 1 2 3"). */
  readonly hint?: Record<Locale, string>;
  readonly controls: readonly PanelControl[];
}

/** Campos que todo controle aceita, além dos do seu tipo. */
interface PanelControlCommon {
  /**
   * Controle de ajuste fino. No celular fica atrás de "Mais ajustes" para a
   * gaveta não cobrir a cena; no desktop aparece sempre.
   */
  readonly secondary?: boolean;
}

export type PanelControl = PanelControlCommon &
  (
    | { kind: 'segmented'; id: string; label: Record<Locale, string>; options: readonly { value: string | number; label: string }[] }
    | {
        kind: 'slider';
        id: string;
        label: Record<Locale, string>;
        min: number;
        max: number;
        step: number;
        logarithmic?: boolean;
        /**
         * Unidade da leitura: 'mm' (ou ausente) mostra distância em cm ou m;
         * qualquer outra sai como número e unidade ('µm', 'mT', 'V', '°').
         */
        unit?: string;
        /** Casas decimais da leitura, quando a unidade não é distância. */
        decimals?: number;
        /**
         * Ids lidos com `experiment.get` para desenhar uma faixa sobre o
         * trilho do slider, como a zona nítida em volta do foco.
         */
        band?: { readonly from: string; readonly to: string };
      }
    | { kind: 'toggle'; id: string; label: Record<Locale, string> }
    | {
        /**
         * Caixas de seleção independentes: cada opção é lida e escrita como
         * `${id}.${value}`, booleano. Mais de uma pode ficar marcada.
         */
        kind: 'checkboxes';
        id: string;
        label: Record<Locale, string>;
        options: readonly { value: string; label: string; tone?: 'focus' | 'warm' | 'cool' }[];
      }
    | {
        kind: 'stops';
        id: string;
        label: Record<Locale, string>;
        /** Valores discretos percorridos pelo slider, em ordem. */
        values: readonly number[];
      }
  );

export interface ExperimentCopy {
  readonly title: Record<Locale, string>;
  readonly subtitle: Record<Locale, string>;
  /** Seções do modal "?" (SPEC §6.7). */
  readonly sections: readonly { id: string; heading: Record<Locale, string>; body: Record<Locale, string> }[];
  /** Atalhos do próprio experimento, listados no modal antes dos do laboratório. */
  readonly shortcuts?: readonly { keys: string; description: Record<Locale, string> }[];
}

/** Um valor do HUD: rótulo e texto já formatados no idioma pedido. */
export interface HudChip {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

/**
 * O que o HUD mostra. Chega **pronto**: a UI não calcula nada, só desenha.
 * Os números vêm do motor óptico pelo experimento (CLAUDE.md §3).
 */
export interface HudModel {
  readonly title: string;
  readonly subtitle: string;
  readonly chips: readonly HudChip[];
  readonly sentence: string;
  /**
   * Trechos da frase que ganham destaque, como os nomes dos objetos na cor do
   * leque de raios de cada um. Opcional: sem isto a frase sai em texto corrido.
   */
  readonly highlights?: readonly HudHighlight[];
}

/** Tom de destaque, mapeado para os tokens de cor da SPEC §3.2. */
export type HudTone = 'focus' | 'warm' | 'cool' | 'strong';

export interface HudHighlight {
  readonly text: string;
  readonly tone: HudTone;
}

/** Linha do painel "Números" (SPEC §2). */
export interface NumberRow {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  /** Explicação curta, mostrada como dica. */
  readonly hint?: string;
}

export interface CinematicShot {
  readonly id: string;
  readonly label: Record<Locale, string>;
  readonly position: THREE.Vector3Like;
  readonly target: THREE.Vector3Like;
  readonly fov?: number;
  /**
   * Variante para telas em retrato (celular). Uma bancada larga vista de
   * frente vira uma tira fina numa tela alta; de viés, ela recua em
   * profundidade e ocupa a altura.
   */
  readonly portrait?: {
    readonly position: THREE.Vector3Like;
    readonly target: THREE.Vector3Like;
    readonly fov?: number;
  };
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
  /** Valor atual de um controle declarado em `ui()`. */
  get(id: string): string | number | boolean;
  /** Avisa quando o estado muda. Devolve a função de remoção. */
  subscribe(listener: () => void): () => void;
  hud(locale: Locale): HudModel;
  numbers(locale: Locale): NumberRow[];
  /** Troca o idioma dos textos que o experimento desenha na cena. */
  setLocale(locale: Locale): void;
  ui(): PanelSchema;
  copy(): ExperimentCopy;
  cameras(): CinematicShot[];
  dispose(): void;
}

/**
 * Registro de experimentos, endereçado por hash (#/lens-focus).
 *
 * Cada experimento ocupa uma **estação**: uma bancada fixa da sala (ADR 0008).
 * O código é carregado sob demanda (`load` com `import()` dinâmico), então
 * quem abre o laboratório num experimento não baixa os outros.
 */
export interface ExperimentDescriptor {
  readonly id: string;
  readonly title: Record<Locale, string>;
  /** Índice da bancada na sala, da esquerda para a direita. */
  readonly station: number;
  /** Carrega o módulo e devolve um experimento novo. */
  readonly load: () => Promise<Experiment>;
}

export interface ExperimentEntry {
  readonly id: string;
  readonly title: Record<Locale, string>;
  readonly station: number;
}

export interface ExperimentRegistry {
  register(descriptor: ExperimentDescriptor): void;
  list(): ExperimentEntry[];
  /** Entrada pelo id, ou a primeira registrada quando o id não casa. */
  resolve(id: string | null): ExperimentEntry | null;
  load(id: string): Promise<Experiment>;
}

export function createExperimentRegistry(): ExperimentRegistry {
  const descriptors = new Map<string, ExperimentDescriptor>();
  const order: string[] = [];

  return {
    register(descriptor: ExperimentDescriptor): void {
      if (descriptors.has(descriptor.id)) throw new Error(`Experimento duplicado: ${descriptor.id}`);
      descriptors.set(descriptor.id, descriptor);
      order.push(descriptor.id);
    },
    list(): ExperimentEntry[] {
      return order.map((id) => {
        const { title, station } = descriptors.get(id)!;
        return { id, title, station };
      });
    },
    resolve(id: string | null): ExperimentEntry | null {
      const found = (id && descriptors.get(id)) || descriptors.get(order[0] ?? '');
      return found ? { id: found.id, title: found.title, station: found.station } : null;
    },
    load(id: string): Promise<Experiment> {
      const descriptor = descriptors.get(id);
      if (!descriptor) return Promise.reject(new Error(`Experimento desconhecido: ${id}`));
      return descriptor.load();
    },
  };
}

/** Lê o id do experimento do hash da URL (#/lens-focus). */
export function experimentIdFromHash(hash: string = window.location.hash): string | null {
  const match = /^#\/([\w-]+)/.exec(hash);
  return match?.[1] ?? null;
}
