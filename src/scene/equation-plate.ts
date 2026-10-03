import * as THREE from 'three';
import { type EquationPlateSpec, equationPlateTexture } from './textures/equation';

/**
 * Placa metálica prateada com equações gravadas em preto. Cada experimento
 * pendura a sua na bancada (a lateral, ou em pé no tampo) e a remove ao sair.
 *
 * A face da frente (+z) leva a textura; as bordas são prata lisa. A origem é
 * o centro da placa.
 */

export interface EquationPlate {
  readonly mesh: THREE.Mesh;
  dispose(): void;
}

export interface EquationPlateOptions {
  readonly spec: EquationPlateSpec;
  /** Tamanho em unidades de cena. */
  readonly width: number;
  readonly height: number;
  readonly thickness?: number;
  /** Resolução da textura: pixels por unidade de cena. */
  readonly pixelsPerUnit?: number;
}

export function createEquationPlate({
  spec,
  width,
  height,
  thickness = 0.008,
  pixelsPerUnit = 1100,
}: EquationPlateOptions): EquationPlate {
  // Textura limitada a 4096 px no lado maior (limite seguro de GPU de celular).
  const scale = Math.min(pixelsPerUnit, 4096 / Math.max(width, height));
  const texture = equationPlateTexture(spec, Math.round(width * scale), Math.round(height * scale));

  const face = new THREE.MeshStandardMaterial({
    map: texture,
    metalness: 0.55,
    roughness: 0.42,
    envMapIntensity: 0.9,
  });
  const edge = new THREE.MeshStandardMaterial({ color: 0xb8bec6, metalness: 0.8, roughness: 0.35 });
  const geometry = new THREE.BoxGeometry(width, height, thickness);
  // Ordem das faces da caixa: +x, −x, +y, −y, +z, −z.
  const mesh = new THREE.Mesh(geometry, [edge, edge, edge, edge, face, edge]);
  mesh.name = 'equation-plate';
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return {
    mesh,
    dispose(): void {
      geometry.dispose();
      face.dispose();
      edge.dispose();
      // A textura fica no cache: voltar à bancada não a redesenha.
    },
  };
}
