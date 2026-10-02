import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../scene/materials';
import { lensMm } from './lens-model';
import { IMAGE_PLANE_MAGNIFICATION } from '../../scene/scale';

/** mm de física → cena, na escala do plano da imagem (lente × ampliação). */
export const plateMm = (millimeters: number): number =>
  lensMm(millimeters) * IMAGE_PLANE_MAGNIFICATION;

/**
 * Plano da imagem: a placa de vidro fosco atrás da objetiva (SPEC §3.1 e §6.5).
 *
 * É aqui que os raios terminam e onde os **anéis de círculo de confusão** são
 * desenhados, um por objeto do diorama, com diâmetro igual ao `b(d)` que o
 * motor calcula — na escala do plano da imagem (a da lente vezes
 * `IMAGE_PLANE_MAGNIFICATION`), a mesma em que os raios chegam a ela. O objeto
 * em foco vira um ponto brilhante, porque `b` vale zero para ele.
 */

export interface ConfusionRing {
  readonly id: string;
  /** Diâmetro do disco no sensor, em mm de física. */
  readonly diameterMm: number;
  readonly color: number;
  /** Altura da imagem no sensor, em mm (negativa = invertida). */
  readonly heightMm: number;
  /** Deslocamento lateral da imagem no sensor, em mm. */
  readonly lateralMm?: number;
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

  const width = plateMm(sensor.w);
  const height = plateMm(sensor.h);

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
  // As quatro barras viram uma geometria só: é uma malha a desenhar, não
  // quatro, em cada passe (orçamento de draw calls, SPEC §8).
  const bars: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    bars.push(
      new THREE.BoxGeometry(frameDepth, height + frameThickness * 2, frameThickness).translate(
        0,
        0,
        side * (width / 2 + frameThickness / 2),
      ),
      new THREE.BoxGeometry(frameDepth, frameThickness, width + frameThickness * 2).translate(
        0,
        side * (height / 2 + frameThickness / 2),
        0,
      ),
    );
  }
  const frameGeometry = mergeGeometries(bars);
  for (const bar of bars) bar.dispose();
  if (!frameGeometry) throw new Error('Falha ao mesclar a moldura da placa');
  geometries.push(frameGeometry);

  const frame = new THREE.Mesh(frameGeometry, materials.anodizedAluminum);
  frame.castShadow = true;
  group.add(frame);

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
      //
      // O plano nasce olhando para +z e é girado para olhar o eixo; nesse giro
      // o u da textura já troca de lado. Por isso só o v é invertido aqui: o
      // resultado, visto de trás da placa, é a imagem girada 180° — invertida
      // nos dois sentidos, como num vidro fosco de verdade, e do mesmo lado
      // em que os raios de cada objeto se fecham.
      const uv = screenGeometry.attributes.uv!;
      if (!screenGeometry.userData.inverted) {
        for (let i = 0; i < uv.count; i += 1) {
          uv.setXY(i, uv.getX(i), 1 - uv.getY(i));
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
        const radius = plateMm(ring.diameterMm / 2);
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
        const point = radius < plateMm(0.02);
        const geometry = point
          ? new THREE.CircleGeometry(plateMm(0.35), 16)
          : new THREE.RingGeometry(Math.max(radius - plateMm(0.12), radius * 0.72), radius, 48);
        geometry.rotateY(-Math.PI / 2);
        ringGeometries.push(geometry);

        const mesh = new THREE.Mesh(geometry, material);
        // A imagem é invertida: altura negativa aponta para baixo no sensor.
        mesh.position.y = plateMm(ring.heightMm);
        mesh.position.z = plateMm(ring.lateralMm ?? 0);
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
