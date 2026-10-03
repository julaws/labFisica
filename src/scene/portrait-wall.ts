import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import portraitsUrl from '../assets/portraits/physicists.jpg?url';
import type { MaterialLibrary } from './materials';
import { nameplateAtlasTexture } from './textures/procedural';

/**
 * Galeria da parede do fundo: seis retratos em preto e branco, três de cada
 * lado da estante, cada um com a placa dourada do nome e dos anos de
 * nascimento e morte, e uma luminária de quadro por cima.
 *
 * As fotos são de domínio público (Wikimedia Commons, ver CREDITS.md), já
 * recortadas, em tons de cinza e com o passe-partout desenhado, num JPEG só.
 * Newton morreu 112 anos antes da primeira fotografia: o dele é o retrato
 * pintado por Godfrey Kneller em 1689, também em preto e branco.
 *
 * Orçamento (SPEC §8): uma malha para as seis fotos, uma para as molduras,
 * uma para o latão (filetes e luminárias), uma para as placas e uma para as
 * lâmpadas acesas. Nada faz sombra: a parede fica fora do mapa de sombra.
 */

export interface Portrait {
  readonly name: string;
  readonly years: string;
}

/** Da esquerda para a direita, na ordem do atlas (3 × 2 ladrilhos). */
export const PORTRAITS: readonly Portrait[] = [
  // Datas no calendário gregoriano (no juliano da Inglaterra de então,
  // 25/12/1642 a 20/3/1726).
  { name: 'Isaac Newton', years: '1643 – 1727' },
  { name: 'Albert Einstein', years: '1879 – 1955' },
  { name: 'Erwin Schrödinger', years: '1887 – 1961' },
  { name: 'Werner Heisenberg', years: '1901 – 1976' },
  { name: 'Max Planck', years: '1858 – 1947' },
  { name: 'Paul Dirac', years: '1902 – 1984' },
];

export interface PortraitWall {
  readonly group: THREE.Group;
  /** Lâmpadas das luminárias, para o bloom. */
  readonly glowing: THREE.Object3D[];
  dispose(): void;
}

export interface PortraitWallOptions {
  readonly materials: MaterialLibrary;
  /** Centro de cada quadro em x, na ordem de `PORTRAITS`. */
  readonly xs: readonly number[];
  /** z da face da parede. */
  readonly wallZ: number;
  /** Altura do centro dos quadros, m. */
  readonly centerY?: number;
}

/** Passe-partout com a foto: o ladrilho do atlas inteiro. */
const MAT = { width: 0.52, height: 0.7 };
/** Moldura: largura da barra e profundidade. */
const BAR = 0.05;
const DEPTH = 0.04;
/** Placa: proporção da textura (1024 × 300). */
const PLATE = { width: 0.34, height: 0.34 * (300 / 1024) };

export function createPortraitWall({ materials, xs, wallZ, centerY = 1.88 }: PortraitWallOptions): PortraitWall {
  const group = new THREE.Group();
  group.name = 'portrait-wall';
  const owned: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
  const glowing: THREE.Object3D[] = [];

  const photoParts: THREE.BufferGeometry[] = [];
  const frameParts: THREE.BufferGeometry[] = [];
  const brassParts: THREE.BufferGeometry[] = [];
  const plateParts: THREE.BufferGeometry[] = [];
  const bulbParts: THREE.BufferGeometry[] = [];

  const outerW = MAT.width + BAR * 2;
  const outerH = MAT.height + BAR * 2;
  const front = wallZ + DEPTH;

  PORTRAITS.forEach((_, index) => {
    const x = xs[index] ?? 0;
    const y = centerY;

    // Foto: o ladrilho (index % 3, ⌊index / 3⌋) do atlas, com a linha de cima
    // no alto da textura.
    const photo = new THREE.PlaneGeometry(MAT.width, MAT.height);
    const uv = photo.attributes.uv!;
    const column = index % 3;
    const row = Math.floor(index / 3);
    for (let i = 0; i < uv.count; i += 1) {
      uv.setXY(i, (uv.getX(i) + column) / 3, (uv.getY(i) + (1 - row)) / 2);
    }
    photoParts.push(photo.translate(x, y, front - 0.012));

    // Moldura preta: quatro barras com quina de 45° simplificada (caixas).
    frameParts.push(
      new THREE.BoxGeometry(outerW, BAR, DEPTH).translate(x, y + outerH / 2 - BAR / 2, wallZ + DEPTH / 2),
      new THREE.BoxGeometry(outerW, BAR, DEPTH).translate(x, y - outerH / 2 + BAR / 2, wallZ + DEPTH / 2),
      new THREE.BoxGeometry(BAR, MAT.height, DEPTH).translate(x - outerW / 2 + BAR / 2, y, wallZ + DEPTH / 2),
      new THREE.BoxGeometry(BAR, MAT.height, DEPTH).translate(x + outerW / 2 - BAR / 2, y, wallZ + DEPTH / 2),
      // Fundo, para a foto não flutuar sobre a parede.
      new THREE.PlaneGeometry(MAT.width, MAT.height).translate(x, y, wallZ + 0.004),
    );

    // Filete de latão na borda interna da moldura.
    const lip = 0.008;
    brassParts.push(
      new THREE.BoxGeometry(MAT.width + lip * 2, lip, 0.01).translate(x, y + MAT.height / 2 + lip / 2, front - 0.004),
      new THREE.BoxGeometry(MAT.width + lip * 2, lip, 0.01).translate(x, y - MAT.height / 2 - lip / 2, front - 0.004),
      new THREE.BoxGeometry(lip, MAT.height, 0.01).translate(x - MAT.width / 2 - lip / 2, y, front - 0.004),
      new THREE.BoxGeometry(lip, MAT.height, 0.01).translate(x + MAT.width / 2 + lip / 2, y, front - 0.004),
    );

    // Luminária de quadro: braço curto saindo da parede e a calha por cima.
    const lampY = y + outerH / 2 + 0.07;
    brassParts.push(
      new THREE.CylinderGeometry(0.008, 0.008, 0.14, 8).rotateX(Math.PI / 2).translate(x, lampY, wallZ + 0.07),
      new THREE.CylinderGeometry(0.022, 0.022, 0.03, 12).rotateX(Math.PI / 2).translate(x, lampY, wallZ + 0.015),
      new THREE.CylinderGeometry(0.026, 0.026, 0.3, 16).rotateZ(Math.PI / 2).translate(x, lampY, wallZ + 0.15),
    );
    // A lâmpada acesa: uma faixa embaixo da calha, voltada para o quadro.
    bulbParts.push(
      new THREE.PlaneGeometry(0.27, 0.02)
        .rotateX(Math.PI / 2)
        .translate(x, lampY - 0.027, wallZ + 0.15),
    );

    // Placa dourada embaixo, sobre um calço de latão.
    const plateY = y - outerH / 2 - 0.085;
    const plate = new THREE.PlaneGeometry(PLATE.width, PLATE.height);
    const plateUv = plate.attributes.uv!;
    for (let i = 0; i < plateUv.count; i += 1) {
      plateUv.setY(i, (plateUv.getY(i) + (PORTRAITS.length - 1 - index)) / PORTRAITS.length);
    }
    plateParts.push(plate.translate(x, plateY, wallZ + 0.013));
    brassParts.push(new THREE.BoxGeometry(PLATE.width, PLATE.height, 0.01).translate(x, plateY, wallZ + 0.007));
  });

  const merge = (parts: THREE.BufferGeometry[], what: string): THREE.BufferGeometry => {
    // Planos e caixas têm os mesmos atributos (posição, normal, uv).
    const merged = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    if (!merged) throw new Error(`Falha ao mesclar ${what}`);
    owned.push(merged);
    return merged;
  };

  // --- Fotos -------------------------------------------------------------------
  // A parede do fundo quase não recebe luz: as luminárias "acendem" as fotos
  // com um pouco de emissão, sem custar uma luz de verdade por quadro.
  const photoTexture = new THREE.TextureLoader().load(portraitsUrl);
  photoTexture.colorSpace = THREE.SRGBColorSpace;
  photoTexture.anisotropy = 8;
  owned.push(photoTexture);
  const photoMaterial = new THREE.MeshStandardMaterial({
    map: photoTexture,
    emissiveMap: photoTexture,
    emissive: new THREE.Color(0xfff1dc),
    emissiveIntensity: 0.42,
    roughness: 0.55,
    metalness: 0,
  });
  owned.push(photoMaterial);
  const photos = new THREE.Mesh(merge(photoParts, 'as fotos'), photoMaterial);
  photos.name = 'portraits';
  group.add(photos);

  // --- Molduras ------------------------------------------------------------------
  const lacquer = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.32, metalness: 0.15 });
  owned.push(lacquer);
  const frames = new THREE.Mesh(merge(frameParts, 'as molduras'), lacquer);
  frames.name = 'portrait-frames';
  group.add(frames);

  const brass = new THREE.Mesh(merge(brassParts, 'o latão dos quadros'), materials.brushedBrass);
  brass.name = 'portrait-brass';
  group.add(brass);

  // --- Placas -------------------------------------------------------------------
  const plateTexture = nameplateAtlasTexture(PORTRAITS.map((portrait) => [portrait.name, portrait.years] as const));
  const plateMaterial = new THREE.MeshStandardMaterial({
    map: plateTexture,
    // Um pouco de brilho próprio, como as fotos: a luminária pega a placa.
    emissiveMap: plateTexture,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.18,
    metalness: 0.75,
    roughness: 0.38,
    envMapIntensity: 0.6,
  });
  owned.push(plateMaterial);
  const plates = new THREE.Mesh(merge(plateParts, 'as placas'), plateMaterial);
  plates.name = 'portrait-plates';
  group.add(plates);

  const bulbs = new THREE.Mesh(merge(bulbParts, 'as lâmpadas'), materials.emissive(0xffe2b0, 1.6));
  bulbs.name = 'portrait-lamps';
  group.add(bulbs);
  glowing.push(bulbs);

  return {
    group,
    glowing,
    dispose(): void {
      for (const item of owned) item.dispose();
      owned.length = 0;
      group.clear();
    },
  };
}
