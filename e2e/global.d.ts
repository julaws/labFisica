export {};

declare global {
  interface Window {
    /** Definido por src/main.ts quando o primeiro quadro foi renderizado. */
    __labReady?: boolean;
    /** Diagnóstico do quadro atual, publicado por src/main.ts. */
    __lab?: { fps: number; frameMs: number; quality: string; drawCalls: number; triangles: number };
  }
}
