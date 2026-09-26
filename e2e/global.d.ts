export {};

declare global {
  interface Window {
    /** Definido por src/main.ts quando o primeiro quadro foi renderizado. */
    __labReady?: boolean;
  }
}
