import * as THREE from 'three';
import type { MaterialLibrary } from '../../scene/materials';
import { lensMm } from './lens-model';

/**
 * Plano da imagem: a placa de vidro fosco atrás da objetiva (SPEC §3.1 e §6.5).
 *
 * É aqui que os raios terminam e onde os **anéis de círculo de confusão** são
 * desenhados, um por objeto do diorama, com diâmetro igual ao `b(d)` que o
 * motor calcula — na escala ampliada da lente, a mesma dos raios. O objeto em
 * foco vira um ponto brilhante, porque `b` vale zero para ele.
 *
 * A imagem projetada de verdade entra na F6; por ora a placa é o difusor e o
 * anteparo dos raios.
 */

export interface ConfusionRing {
  readonly id: string;
  /** Diâmetro do disco no sensor, em mm de física. */
  readonly diameterMm: number;
  readonly color: number;
  /** Altura da imagem no sensor, em mm (negativa = invertida). */
  readonly heightMm: number;
}

export interface ImagePlane {
  readonly group: THREE.Group;
  /** Posição da placa ao longo do eixo óptico, em unidades de cena. */
  readonly x: number;
  /** Superfície onde a imagem da F6 será projetada. */
  readonly screen: THREE.Mesh;
  setRings(rings: readonly ConfusionRing[]): void;
  /**
   * Liga a imagem projetada ao vidro fosco. Ela entra **girada 180°**, que é
   * como a luz de fato a deposita ali (SPEC §6.6).
   */
  setProjectedImage(texture: THREE.Texture): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

export interface ImagePlaneOptions {
  readonly materials: MaterialLibrary;
  /** Posição fixa da placa no eixo óptico, em unidades de cena. */
  readonly x: number;
  /** Sensor, em mm de física. */
  readonly sensor: { w: number; h: number };
}

export function createImagePlane({ materials, x, sensor }: ImagePlaneOptions): ImagePlane {
  const group = new THREE.Group();
  group.name = 'image-plane';
  group.position.x = x;

  const geometries: THREE.BufferGeometry[] = [];
  const ownedMaterials: THREE.Material[] = [];
  const ownedTextures: THREE.Texture[] = [];

  const width = lensMm(sensor.w);
  const height = lensMm(sensor.h);

  // --- Vidro fosco -----------------------------------------------------------
  const screenGeometry = new THREE.PlaneGeometry(width, height);
  screenGeometry.rotateY(-Math.PI / 2);
  geometries.push(screenGeometry);

  const screenMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x2a3340,
    roughness: 0.82,
    metalness: 0,
    transmission: 0.45,
    thickness: lensMm(1.2),
    ior: 1.46,
    side: THREE.DoubleSide,
  });
  ownedMaterials.push(screenMaterial);

  const screen = new THREE.Mesh(screenGeometry, screenMaterial);
  group.add(screen);

  // --- Moldura ---------------------------------------------------------------
  const frameThickness = lensMm(3.5);
  const frameDepth = lensMm(2.5);
  const frameGeometry = new THREE.BoxGeometry(frameDepth, height + frameThickness * 2, frameThickness);
  geometries.push(frameGeometry);

  for (const side of [-1, 1]) {
    const bar = new THREE.Mesh(frameGeometry, materials.anodizedAluminum);
    bar.position.z = side * (width / 2 + frameThickness / 2);
    bar.castShadow = true;
    group.add(bar);
  }

  const railGeometry = new THREE.BoxGeometry(frameDepth, frameThickness, width + frameThickness * 2);
  geometries.push(railGeometry);
  for (const side of [-1, 1]) {
    const bar = new THREE.Mesh(railGeometry, materials.anodizedAluminum);
    bar.position.y = side * (height / 2 + frameThickness / 2);
    bar.castShadow = true;
    group.add(bar);
  }

  // --- Anéis de círculo de confusão -----------------------------------------
  // Um anel por objeto, recriado a cada mudança de estado. São poucos (três),
  // então recriar é mais simples e mais barato que manter um pool.
  const ringGroup = new THREE.Group();
  ringGroup.position.x = lensMm(0.4); // um fio à frente do vidro, sem z-fighting
  group.add(ringGroup);

  const ringGeometries: THREE.BufferGeometry[] = [];
  const ringMaterials: THREE.Material[] = [];

  function clearRings(): void {
    for (const geometry of ringGeometries) geometry.dispose();
    for (const material of ringMaterials) material.dispose();
    ringGeometries.length = 0;
    ringMaterials.length = 0;
    ringGroup.clear();
  }

  return {
    group,
    x,
    screen,

    setProjectedImage(texture: THREE.Texture): void {
      // A inversão de 180° vai nas UVs da placa, não na textura. Clonar a
      // textura de um render target para girá-la não funciona: o clone
      // compartilha a imagem mas perde o vínculo com o framebuffer, e a placa
      // passa a mostrar uma textura vazia.
      const uv = screenGeometry.attributes.uv!;
      if (!screenGeometry.userData.inverted) {
        for (let i = 0; i < uv.count; i += 1) {
          uv.setXY(i, 1 - uv.getX(i), 1 - uv.getY(i));
        }
        uv.needsUpdate = true;
        screenGeometry.userData.inverted = true;
      }

      screenMaterial.map = texture;
      screenMaterial.emissiveMap = texture;
      screenMaterial.emissive = new THREE.Color(0xffffff);
      screenMaterial.emissiveIntensity = 0.85;
      screenMaterial.transmission = 0;
      screenMaterial.color.setHex(0x101418);
      screenMaterial.needsUpdate = true;
    },

    setRings(rings: readonly ConfusionRing[]): void {
      clearRings();

      for (const ring of rings) {
        const radius = lensMm(ring.diameterMm / 2);
        const material = new THREE.MeshBasicMaterial({
          color: ring.color,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        });
        ringMaterials.push(material);

        // Abaixo de um limiar o disco é um ponto: é o objeto em foco.
        const point = radius < lensMm(0.02);
        const geometry = point
          ? new THREE.CircleGeometry(lensMm(0.35), 16)
          : new THREE.RingGeometry(Math.max(radius - lensMm(0.12), radius * 0.72), radius, 48);
        geometry.rotateY(-Math.PI / 2);
        ringGeometries.push(geometry);

        const mesh = new THREE.Mesh(geometry, material);
        // A imagem é invertida: altura negativa aponta para baixo no sensor.
        mesh.position.y = lensMm(ring.heightMm);
        ringGroup.add(mesh);
      }
    },

    setVisible(visible: boolean): void {
      group.visible = visible;
    },

    dispose(): void {
      clearRings();
      for (const geometry of geometries) geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
      for (const texture of ownedTextures) texture.dispose();
      geometries.length = 0;
      ownedMaterials.length = 0;
      ownedTextures.length = 0;
      group.clear();
    },
  };
}
