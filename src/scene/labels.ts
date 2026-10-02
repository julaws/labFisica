import * as THREE from 'three';

/**
 * Etiquetas 3D (SPEC §3.3 e §6.5): textos HTML presos a pontos da cena,
 * reprojetados a cada quadro. "Plano da imagem", "Anel de foco · arraste",
 * "Plano de foco · 60 cm", "Zona nítida · 1,9 cm".
 *
 * São HTML, não sprites: o texto fica nítido em qualquer resolução, é lido por
 * leitores de tela e herda a tipografia da interface. Uma etiqueta some quando
 * o ponto sai da tela ou fica atrás da câmera.
 */

export interface LabelSpec {
  readonly id: string;
  /** Objeto ao qual a etiqueta está presa. */
  readonly anchor: THREE.Object3D;
  /** Deslocamento em relação ao objeto, em coordenadas locais dele. */
  readonly offset?: THREE.Vector3Like;
  readonly text: string;
  /** Cor do marcador, em hex; por padrão o ciano de foco. */
  readonly accent?: string;
}

export interface LabelLayer {
  add(spec: LabelSpec): void;
  setText(id: string, text: string): void;
  remove(id: string): void;
  /**
   * Reprojeta todas as etiquetas. Chamado uma vez por quadro. `occluders` são
   * os retângulos dos painéis da interface: uma etiqueta que cai embaixo de um
   * deles some, em vez de vazar pelo fundo translúcido (critério 9, SPEC §10).
   */
  update(camera: THREE.Camera, width: number, height: number, occluders?: readonly DOMRect[]): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

interface LabelEntry {
  spec: LabelSpec;
  element: HTMLDivElement;
  text: HTMLSpanElement;
  /** Tamanho medido da etiqueta, em px; refeito quando o texto muda. */
  size: { w: number; h: number } | null;
}

export function createLabelLayer(parent: HTMLElement): LabelLayer {
  const root = document.createElement('div');
  root.className = 'labels';
  root.setAttribute('aria-hidden', 'false');
  parent.appendChild(root);

  const entries = new Map<string, LabelEntry>();
  const world = new THREE.Vector3();
  const offset = new THREE.Vector3();

  return {
    add(spec: LabelSpec): void {
      const element = document.createElement('div');
      element.className = 'label';
      element.dataset.id = spec.id;
      if (spec.accent) element.style.setProperty('--accent', spec.accent);

      const dot = document.createElement('span');
      dot.className = 'label__dot';
      const text = document.createElement('span');
      text.className = 'label__text';
      renderLabelText(text, spec.text);

      element.append(dot, text);
      root.appendChild(element);
      entries.set(spec.id, { spec, element, text, size: null });
    },

    setText(id: string, value: string): void {
      const entry = entries.get(id);
      if (entry && entry.text.dataset.value !== value) {
        renderLabelText(entry.text, value);
        entry.size = null;
      }
    },

    remove(id: string): void {
      entries.get(id)?.element.remove();
      entries.delete(id);
    },

    update(
      camera: THREE.Camera,
      width: number,
      height: number,
      occluders: readonly DOMRect[] = [],
    ): void {
      // Etiquetas já postas neste quadro: uma que esbarre numa delas some,
      // em vez de cobrir o texto da outra (vale sobretudo no celular).
      const placed: { x: number; y: number; w: number; h: number }[] = [];

      for (const entry of entries.values()) {
        const { spec, element } = entry;
        offset.set(spec.offset?.x ?? 0, spec.offset?.y ?? 0, spec.offset?.z ?? 0);
        world.copy(offset);
        spec.anchor.localToWorld(world);
        world.project(camera);

        // z > 1: atrás da câmera. Fora de [-1, 1]: fora da tela.
        const visible =
          spec.anchor.visible && world.z < 1 && Math.abs(world.x) < 1.02 && Math.abs(world.y) < 1.02;

        if (!visible) {
          element.classList.add('label--hidden');
          continue;
        }

        // Medida uma vez por texto: ler o tamanho a cada quadro forçaria
        // um recálculo de layout por etiqueta.
        if (!entry.size) {
          element.classList.remove('label--hidden');
          entry.size = { w: element.offsetWidth || 180, h: element.offsetHeight || 26 };
        }
        const { w, h } = entry.size;

        // Presa ao ponto, mas sem passar da borda direita da tela.
        const x = Math.max(4, Math.min((world.x * 0.5 + 0.5) * width, width - w - 4));
        const y = (-world.y * 0.5 + 0.5) * height;

        // Se a caixa encosta num painel ou numa etiqueta já posta, esconde.
        const covered =
          occluders.some(
            (rect) => x + w > rect.left && x < rect.right && y + h > rect.top && y - 4 < rect.bottom,
          ) ||
          placed.some((p) => x < p.x + p.w + 4 && p.x < x + w + 4 && y < p.y + p.h + 2 && p.y < y + h + 2);
        element.classList.toggle('label--hidden', covered);
        if (covered) continue;
        placed.push({ x, y, w, h });

        element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      }
    },

    setVisible(visible: boolean): void {
      root.hidden = !visible;
    },

    dispose(): void {
      root.remove();
      entries.clear();
    },
  };
}

/**
 * "Plano de foco · 60,0 cm" vira nome + detalhe: o que vem depois do " · "
 * sai em fonte mono e mais apagado, como as leituras da referência.
 */
function renderLabelText(target: HTMLElement, value: string): void {
  target.dataset.value = value;
  const cut = value.indexOf(' · ');
  if (cut < 0) {
    target.textContent = value;
    return;
  }
  const detail = document.createElement('em');
  detail.textContent = value.slice(cut + 3);
  target.replaceChildren(document.createTextNode(value.slice(0, cut)), detail);
}
