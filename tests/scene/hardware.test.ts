import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HardwareKit, bncJack, instrumentCase, opticalPost, panelKnob, pose, screenBezel } from '../../src/scene/hardware';

const bounds = (geometries: Map<string, THREE.BufferGeometry>): THREE.Box3 => {
  const box = new THREE.Box3();
  for (const geometry of geometries.values()) {
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox!);
  }
  return box;
};

describe('kit de ferragens', () => {
  it('mescla as peças numa geometria por acabamento', () => {
    const kit = new HardwareKit();
    opticalPost(kit, pose(0, 0, 0), { top: 0.2 });
    opticalPost(kit, pose(0.3, 0, 0), { top: 0.15 });
    const merged = kit.merge();
    // Base e suporte anodizados, parafusos cromados, soquetes escuros,
    // parafuso de aperto em latão e poste de aço: cinco acabamentos.
    expect([...merged.keys()].sort()).toEqual(['anodized', 'brass', 'chrome', 'rubber', 'steel']);
    const lean = new HardwareKit();
    opticalPost(lean, pose(0, 0, 0), { top: 0.1, base: false, thumbscrew: null });
    expect([...lean.merge().keys()].sort()).toEqual(['anodized', 'steel']);
    expect(kit.finishes).toBe(0);
  });

  it('o poste vai do tampo até a altura pedida', () => {
    const kit = new HardwareKit();
    opticalPost(kit, pose(0.1, 0, -0.05), { top: 0.23 });
    const box = bounds(kit.merge());
    expect(box.min.y).toBeCloseTo(0, 5);
    expect(box.max.y).toBeCloseTo(0.23, 3);
    // Centrado na pose pedida.
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0.1, 2);
  });

  it('poste sem base começa no suporte e não fica mais baixo que ele', () => {
    const kit = new HardwareKit();
    opticalPost(kit, pose(0, 0, 0), { top: 0.02, base: false });
    const box = bounds(kit.merge());
    expect(box.min.y).toBeCloseTo(0, 5);
    expect(box.max.y).toBeGreaterThanOrEqual(0.02 - 1e-6);
  });

  it('o gabinete fica sobre os pés e informa a face do painel', () => {
    const kit = new HardwareKit();
    const front = instrumentCase(kit, pose(0, 0, 0), { width: 0.3, height: 0.12, depth: 0.2, handles: true });
    panelKnob(kit, pose(0.05, 0.06, front.frontZ));
    bncJack(kit, pose(-0.05, 0.04, front.frontZ));
    const box = bounds(kit.merge());
    expect(box.min.y).toBeCloseTo(0, 5);
    expect(front.bottom).toBeGreaterThan(0);
    expect(front.frontZ).toBeGreaterThan(0.1);
    // Os botões saem do painel, para a frente.
    expect(box.max.z).toBeGreaterThan(front.frontZ);
  });

  it('a moldura envolve a tela com a borda pedida', () => {
    const kit = new HardwareKit();
    screenBezel(kit, pose(0, 0, 0), { width: 0.4, height: 0.25, border: 0.02 });
    const box = bounds(kit.merge());
    expect(box.max.x - box.min.x).toBeGreaterThan(0.44 - 1e-3);
    expect(box.max.y - box.min.y).toBeGreaterThan(0.29 - 1e-3);
  });
});
