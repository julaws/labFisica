import type * as THREE from 'three';
import type { LoopHandle } from './loop';

export interface StatsPanel {
  toggle(): void;
  update(): void;
  dispose(): void;
}

/**
 * Painel de estatísticas da tecla `P` (só em modo dev, CLAUDE.md §8).
 * Mostra fps, tempo de quadro e os contadores de renderer.info usados no
 * orçamento de desempenho da SPEC §8.
 */
export function createStatsPanel(
  parent: HTMLElement,
  renderer: THREE.WebGLRenderer,
  loop: LoopHandle,
): StatsPanel {
  const el = document.createElement('div');
  el.className = 'stats';
  el.hidden = true;
  parent.appendChild(el);

  let lastUpdate = 0;

  return {
    toggle(): void {
      el.hidden = !el.hidden;
    },
    update(): void {
      if (el.hidden) return;
      const now = performance.now();
      if (now - lastUpdate < 250) return;
      lastUpdate = now;

      const { render, memory } = renderer.info;
      el.textContent = [
        `${loop.fps.toFixed(0)} fps · ${loop.frameMs.toFixed(1)} ms`,
        `draw calls ${render.calls}`,
        `triângulos ${render.triangles.toLocaleString('pt-BR')}`,
        `geometrias ${memory.geometries} · texturas ${memory.textures}`,
      ].join('\n');
    },
    dispose(): void {
      el.remove();
    },
  };
}
