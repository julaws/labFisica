export type FrameCallback = (dt: number, elapsed: number) => void;

export interface LoopHandle {
  start(): void;
  stop(): void;
  /** Pede um quadro quando o loop está em modo sob demanda. */
  invalidate(): void;
  readonly fps: number;
  readonly frameMs: number;
}

export interface LoopOptions {
  /** Chamado a cada quadro com o delta em segundos (limitado a 100 ms). */
  onFrame: FrameCallback;
  /** Quando true, só renderiza após invalidate() ou enquanto houver animação (SPEC §8). */
  onDemand?: boolean;
}

/**
 * Loop de animação com delta estável, pausa quando a aba está oculta e
 * renderização sob demanda opcional.
 */
export function createLoop({ onFrame, onDemand = false }: LoopOptions): LoopHandle {
  let rafId = 0;
  let running = false;
  let last = 0;
  let elapsed = 0;
  let needsFrame = true;
  let fps = 0;
  let frameMs = 0;
  let fpsAccum = 0;
  let fpsFrames = 0;

  const tick = (now: number): void => {
    if (!running) return;
    rafId = requestAnimationFrame(tick);

    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (dt <= 0) return;

    if (onDemand && !needsFrame) return;
    needsFrame = !onDemand;

    const t0 = performance.now();
    elapsed += dt;
    onFrame(dt, elapsed);
    frameMs = performance.now() - t0;

    fpsAccum += dt;
    fpsFrames += 1;
    if (fpsAccum >= 0.5) {
      fps = fpsFrames / fpsAccum;
      fpsAccum = 0;
      fpsFrames = 0;
    }
  };

  const onVisibility = (): void => {
    if (document.hidden) {
      stop();
    } else {
      start();
    }
  };

  function start(): void {
    if (running) return;
    running = true;
    last = performance.now();
    needsFrame = true;
    rafId = requestAnimationFrame(tick);
  }

  function stop(): void {
    running = false;
    cancelAnimationFrame(rafId);
  }

  document.addEventListener('visibilitychange', onVisibility);

  return {
    start,
    stop,
    invalidate(): void {
      needsFrame = true;
    },
    get fps(): number {
      return fps;
    },
    get frameMs(): number {
      return frameMs;
    },
  };
}
