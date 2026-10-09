import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { resizeToDisplaySize } from '../../src/core/renderer';

/** Renderer de mentira: só o canvas e os dois métodos que o redimensionamento usa. */
function fakeRenderer(client: [number, number], buffer: [number, number]) {
  const domElement = { clientWidth: client[0], clientHeight: client[1], width: buffer[0], height: buffer[1] };
  let ratio = 1;
  return {
    domElement,
    setPixelRatio: vi.fn((value: number) => {
      ratio = value;
    }),
    setSize: vi.fn((w: number, h: number) => {
      domElement.width = Math.floor(w * ratio);
      domElement.height = Math.floor(h * ratio);
    }),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('redimensionamento do canvas', () => {
  it('acerta buffer e câmera quando o canvas muda de tamanho', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    const renderer = fakeRenderer([390, 754], [390, 664]);
    const camera = new THREE.PerspectiveCamera(50, 390 / 664);
    expect(resizeToDisplaySize(renderer, camera, 2)).toBe(true);
    expect(renderer.domElement.height).toBe(754);
    expect(camera.aspect).toBeCloseTo(390 / 754, 9);
  });

  it('acerta a câmera mesmo quando o buffer já foi redimensionado por outro (o pós-processamento)', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    // O canvas cresceu (barra de endereço) e o composer já ajustou o buffer.
    const renderer = fakeRenderer([390, 754], [390, 754]);
    const camera = new THREE.PerspectiveCamera(50, 390 / 664);
    expect(resizeToDisplaySize(renderer, camera, 2)).toBe(true);
    expect(renderer.setSize).not.toHaveBeenCalled();
    expect(camera.aspect).toBeCloseTo(390 / 754, 9);
  });

  it('não faz nada quando tudo já bate', () => {
    vi.stubGlobal('window', { devicePixelRatio: 2 });
    const renderer = fakeRenderer([390, 664], [780, 1328]);
    const camera = new THREE.PerspectiveCamera(50, 390 / 664);
    expect(resizeToDisplaySize(renderer, camera, 2)).toBe(false);
  });
});
