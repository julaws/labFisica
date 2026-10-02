/**
 * Tela de carregamento com progresso real (SPEC §7 e §8).
 *
 * As etapas têm peso: o HDRI domina o tempo, as texturas procedurais e a
 * geometria são rápidas. O progresso mostrado é a soma ponderada, não uma
 * animação fingida.
 */

export interface LoadingStep {
  readonly id: string;
  /** Texto mostrado enquanto a etapa roda, em pt-BR. */
  readonly label: string;
  /** Peso relativo no total. */
  readonly weight: number;
}

export interface LoadingScreen {
  /** Marca o início de uma etapa. */
  begin(id: string): void;
  /** Progresso dentro da etapa atual, de 0 a 1. */
  progress(fraction: number): void;
  /** Conclui a etapa atual. */
  complete(id: string): void;
  /** Esconde a tela com fade. */
  finish(): void;
  dispose(): void;
}

export const DEFAULT_STEPS: LoadingStep[] = [
  { id: 'textures', label: 'Polindo o vidro…', weight: 1 },
  { id: 'environment', label: 'Acendendo o estúdio…', weight: 4 },
  { id: 'room', label: 'Arrumando a sala…', weight: 1.5 },
  { id: 'post', label: 'Ajustando as lentes da câmera…', weight: 1 },
  { id: 'experiment', label: 'Montando o experimento…', weight: 2.5 },
];

export function createLoadingScreen(steps: LoadingStep[] = DEFAULT_STEPS): LoadingScreen {
  const root = document.querySelector<HTMLElement>('#loading');
  const stepEl = root?.querySelector<HTMLElement>('.loading__step') ?? null;
  const fillEl = root?.querySelector<HTMLElement>('.loading__fill') ?? null;

  const total = steps.reduce((sum, step) => sum + step.weight, 0);
  const done = new Set<string>();
  let currentId: string | null = null;
  let currentFraction = 0;

  const render = (): void => {
    let value = 0;
    for (const step of steps) {
      if (done.has(step.id)) value += step.weight;
      else if (step.id === currentId) value += step.weight * currentFraction;
    }

    const percent = Math.min(100, Math.round((value / total) * 100));
    if (fillEl) fillEl.style.width = `${percent}%`;

    const step = steps.find((s) => s.id === currentId);
    if (stepEl && step) stepEl.textContent = step.label;
  };

  return {
    begin(id: string): void {
      currentId = id;
      currentFraction = 0;
      render();
    },
    progress(fraction: number): void {
      currentFraction = Math.min(1, Math.max(0, fraction));
      render();
    },
    complete(id: string): void {
      done.add(id);
      currentFraction = 0;
      render();
    },
    finish(): void {
      if (fillEl) fillEl.style.width = '100%';
      root?.classList.add('loading--done');
      window.setTimeout(() => root?.setAttribute('hidden', ''), 420);
    },
    dispose(): void {
      root?.remove();
    },
  };
}
