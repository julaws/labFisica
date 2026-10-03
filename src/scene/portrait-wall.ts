import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import portraitsUrl from '../assets/portraits/physicists.jpg?url';
import type { MaterialLibrary } from './materials';
import { nameplateAtlasTexture } from './textures/procedural';

/**
 * Galeria da parede do fundo: onze retratos em preto e branco, lado a lado,
 * numa fileira de cada lado da estante — os físicos à esquerda e as
 * cientistas à direita. Cada quadro tem a placa dourada do nome e dos anos de
 * nascimento e morte e uma luminária por cima. Clicar num quadro abre o
 * retrato na frente da tela (`ui/portrait-viewer.ts`).
 *
 * As fotos (Wikimedia Commons, ver CREDITS.md) já vêm recortadas, em tons de
 * cinza e com o passe-partout desenhado, num JPEG só (atlas 4 × 3); cada uma
 * tem também uma versão ampliada em `hd/`.
 *
 * Orçamento (SPEC §8): uma malha para todas as fotos, uma para as molduras,
 * uma para o latão (filetes, calços e luminárias), uma para as placas e uma
 * para as lâmpadas acesas. Nada faz sombra.
 */

export interface Portrait {
  /** Nome do arquivo ampliado em `assets/portraits/hd/`. */
  readonly id: string;
  readonly name: string;
  readonly years: string;
  /** Crédito da foto, mostrado no visualizador. */
  readonly credit: string;
}

/** Na ordem do atlas (linhas de 4 ladrilhos); a posição na parede vem de fora. */
export const PORTRAITS: readonly Portrait[] = [
  // Datas no calendário gregoriano (no juliano da Inglaterra de então,
  // 25/12/1642 a 20/3/1726).
  { id: 'newton', name: 'Isaac Newton', years: '1643 – 1727', credit: 'Godfrey Kneller, 1689 · domínio público' },
  { id: 'einstein', name: 'Albert Einstein', years: '1879 – 1955', credit: 'Ferdinand Schmutzer, 1921 · domínio público' },
  { id: 'schrodinger', name: 'Erwin Schrödinger', years: '1887 – 1961', credit: 'Narodowe Archiwum Cyfrowe, 1933 · domínio público' },
  { id: 'heisenberg', name: 'Werner Heisenberg', years: '1901 – 1976', credit: 'autor desconhecido, c. 1927 · domínio público' },
  { id: 'planck', name: 'Max Planck', years: '1858 – 1947', credit: 'autor desconhecido, 1933 · domínio público' },
  { id: 'dirac', name: 'Paul Dirac', years: '1902 – 1984', credit: 'Fundação Nobel, 1933 · domínio público' },
  { id: 'curie', name: 'Marie Curie', years: '1867 – 1934', credit: 'Henri Manuel, c. 1920 · domínio público' },
  { id: 'noether', name: 'Emmy Noether', years: '1882 – 1935', credit: 'autor desconhecido, c. 1900 · domínio público' },
  { id: 'meitner', name: 'Lise Meitner', years: '1878 – 1968', credit: 'autor desconhecido, 1916 · domínio público' },
  {
    id: 'wu',
    name: 'Chien-Shiung Wu',
    years: '1912 – 1997',
    credit: 'Smithsonian Institution Archives, 1958 · sem restrições de direitos conhecidas',
  },
  {
    id: 'franklin',
    name: 'Rosalind Franklin',
    years: '1920 – 1958',
    credit: 'MRC Laboratory of Molecular Biology, 1955 · CC BY-SA 4.0',
  },
];

/**
 * Geometria do atlas, em pixels: cada ladrilho é o passe-partout inteiro, e
 * a foto fica na janela do meio. O visualizador usa os mesmos números para o
 * quadro sair da parede sem mudar de desenho.
 */
export const PORTRAIT_ATLAS = {
  url: portraitsUrl,
  columns: 4,
  rows: 3,
  tile: { width: 520, height: 700 },
  photo: { x: 60, y: 83.5, width: 400, height: 533 },
} as const;

/**
 * Tamanho do quadro, em metros: moldura e passe-partout. `SIZE` escala tudo
 * junto (moldura, placa, filete); numa fileira só, os quadros têm o tamanho
 * cheio, 0,62 × 0,80 m.
 */
const SIZE = 1;
export const PORTRAIT_FRAME = {
  outer: { width: 0.62 * SIZE, height: 0.8 * SIZE },
  mat: { width: 0.52 * SIZE, height: 0.7 * SIZE },
} as const;

export interface PortraitWall {
  readonly group: THREE.Group;
  /** Lâmpadas das luminárias, para o bloom. */
  readonly glowing: THREE.Object3D[];
  /** Malhas que o clique testa: fotos e molduras. */
  readonly targets: THREE.Object3D[];
  /** Qual retrato está mais perto deste ponto da parede (coordenadas de mundo). */
  indexAt(point: THREE.Vector3): number;
  /** Os quatro cantos da moldura do retrato, em coordenadas de mundo. */
  corners(index: number): THREE.Vector3[];
  /** Tira a foto do quadro (ela "saiu" para a frente da tela) ou a devolve. */
  setHidden(index: number, hidden: boolean): void;
  dispose(): void;
}

export interface PortraitWallOptions {
  readonly materials: MaterialLibrary;
  /** Centro de cada quadro na parede (x, y), na ordem de `PORTRAITS`. */
  readonly positions: readonly { readonly x: number; readonly y: number }[];
  /** z da face da parede. */
  readonly wallZ: number;
}

/** Passe-partout com a foto: o ladrilho do atlas inteiro. */
const MAT = PORTRAIT_FRAME.mat;
/** Moldura: largura da barra e profundidade. */
const BAR = 0.05 * SIZE;
const DEPTH = 0.04 * SIZE;
/** Placa: proporção da textura (1024 × 300). */
const PLATE = { width: 0.34 * SIZE, height: 0.34 * SIZE * (300 / 1024) };

export function createPortraitWall({ materials, positions, wallZ }: PortraitWallOptions): PortraitWall {
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
    const { x, y } = positions[index] ?? { x: 0, y: 0 };

    // Foto: o ladrilho (coluna, linha) do atlas, com a linha de cima no alto
    // da textura.
    const photo = new THREE.PlaneGeometry(MAT.width, MAT.height);
    const uv = photo.attributes.uv!;
    const { columns, rows } = PORTRAIT_ATLAS;
    const column = index % columns;
    const row = Math.floor(index / columns);
    for (let i = 0; i < uv.count; i += 1) {
      uv.setXY(i, (uv.getX(i) + column) / columns, (uv.getY(i) + (rows - 1 - row)) / rows);
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
    const lip = 0.008 * SIZE;
    brassParts.push(
      new THREE.BoxGeometry(MAT.width + lip * 2, lip, 0.01).translate(x, y + MAT.height / 2 + lip / 2, front - 0.004),
      new THREE.BoxGeometry(MAT.width + lip * 2, lip, 0.01).translate(x, y - MAT.height / 2 - lip / 2, front - 0.004),
      new THREE.BoxGeometry(lip, MAT.height, 0.01).translate(x - MAT.width / 2 - lip / 2, y, front - 0.004),
      new THREE.BoxGeometry(lip, MAT.height, 0.01).translate(x + MAT.width / 2 + lip / 2, y, front - 0.004),
    );

    // Luminária de quadro: braço curto saindo da parede e a calha por cima,
    // com a lâmpada acesa embaixo, voltada para o quadro.
    const lampY = y + outerH / 2 + 0.07 * SIZE;
    brassParts.push(
      new THREE.CylinderGeometry(0.008, 0.008, 0.14, 8).rotateX(Math.PI / 2).translate(x, lampY, wallZ + 0.07),
      new THREE.CylinderGeometry(0.022, 0.022, 0.03, 12).rotateX(Math.PI / 2).translate(x, lampY, wallZ + 0.015),
      new THREE.CylinderGeometry(0.026, 0.026, 0.3 * SIZE, 16).rotateZ(Math.PI / 2).translate(x, lampY, wallZ + 0.15),
    );
    bulbParts.push(
      new THREE.PlaneGeometry(0.27 * SIZE, 0.02)
        .rotateX(Math.PI / 2)
        .translate(x, lampY - 0.027, wallZ + 0.15),
    );

    // Placa dourada embaixo, sobre um calço de latão.
    const plateY = y - outerH / 2 - 0.085 * SIZE;
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
  const photoGeometry = merge(photoParts, 'as fotos');
  const photos = new THREE.Mesh(photoGeometry, photoMaterial);
  photos.name = 'portraits';
  group.add(photos);
  // Cada foto são 4 vértices seguidos na malha mesclada. Esconder uma é
  // empurrá-los para trás da parede: só 4 vértices mudam, uma vez por clique.
  const photoPositions = photoGeometry.attributes.position as THREE.BufferAttribute;
  const restZ = Float32Array.from({ length: photoPositions.count }, (_, i) => photoPositions.getZ(i));

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
    // Um pouco de brilho próprio, como as fotos: a parede do fundo é escura.
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
    targets: [photos, frames],

    indexAt(point: THREE.Vector3): number {
      let best = 0;
      let bestDistance = Infinity;
      positions.forEach(({ x, y }, index) => {
        const distance = Math.hypot(x - point.x, y - point.y);
        if (distance < bestDistance) {
          best = index;
          bestDistance = distance;
        }
      });
      return best;
    },

    corners(index: number): THREE.Vector3[] {
      const { x, y } = positions[index] ?? { x: 0, y: 0 };
      group.updateWorldMatrix(true, false);
      return [
        [-1, 1],
        [1, 1],
        [1, -1],
        [-1, -1],
      ].map(([sx, sy]) =>
        new THREE.Vector3(x + (sx! * outerW) / 2, y + (sy! * outerH) / 2, front).applyMatrix4(group.matrixWorld),
      );
    },

    setHidden(index: number, hidden: boolean): void {
      for (let i = index * 4; i < index * 4 + 4; i += 1) {
        photoPositions.setZ(i, hidden ? wallZ - 0.05 : restZ[i]!);
      }
      photoPositions.needsUpdate = true;
    },

    dispose(): void {
      for (const item of owned) item.dispose();
      owned.length = 0;
      group.clear();
    },
  };
}
