import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HardwareKit, capScrew, groupGeometries, screenBezel } from '../../scene/hardware';
import type { MaterialLibrary } from '../../scene/materials';

/**
 * Placa das fendas (ADR 0009): uma chapa escura com duas fendas verticais,
 * uma tampa deslizante em frente de cada uma e um detector de caminho atrás
 * de cada fenda — uma bobina por onde o elétron passa, com um LED em cima.
 *
 * Tudo em escala transversal ampliada (a fenda real tem 1,2 µm). A chapa fica
 * no plano x = 0 do grupo, com as fendas em z = ±separação/2; o canhão está
 * em −x e o anteparo em +x.
 */

export type SlitSide = 'left' | 'right';

export interface SlitPlate {
  readonly group: THREE.Group;
  readonly glowing: THREE.Object3D[];
  /** z de cada fenda, em unidades de cena (esquerda negativa). */
  readonly slitZ: Record<SlitSide, number>;
  /** Meia altura das fendas, em unidades de cena. */
  readonly slitHalfHeight: number;
  setOpen(left: boolean, right: boolean): void;
  setDetectors(on: boolean): void;
  /** Pisca o LED de um detector: um elétron acabou de passar por ali. */
  flash(side: SlitSide): void;
  update(dt: number): void;
  dispose(): void;
}

export interface SlitPlateOptions {
  readonly materials: MaterialLibrary;
  /** Largura de cada fenda e distância entre os centros, em unidades de cena. */
  readonly slitWidth: number;
  readonly separation: number;
}

const PLATE = { thickness: 0.012, halfWidth: 0.2, halfHeight: 0.16 };
const SLIT_HALF_HEIGHT = 0.11;

export function createSlitPlate({ materials, slitWidth, separation }: SlitPlateOptions): SlitPlate {
  const group = new THREE.Group();
  group.name = 'slit-plate';
  const geometries: THREE.BufferGeometry[] = [];
  const owned: THREE.Material[] = [];
  const glowing: THREE.Object3D[] = [];

  const half = separation / 2;
  const slitZ: Record<SlitSide, number> = { left: -half, right: half };

  // --- Chapa com duas aberturas, em pedaços mesclados -------------------------
  const box = (zMin: number, zMax: number, yMin: number, yMax: number): THREE.BufferGeometry =>
    new THREE.BoxGeometry(PLATE.thickness, yMax - yMin, zMax - zMin).translate(
      0,
      (yMin + yMax) / 2,
      (zMin + zMax) / 2,
    );
  const w = slitWidth / 2;
  const pieces = [
    box(-PLATE.halfWidth, -half - w, -SLIT_HALF_HEIGHT, SLIT_HALF_HEIGHT),
    box(-half + w, half - w, -SLIT_HALF_HEIGHT, SLIT_HALF_HEIGHT),
    box(half + w, PLATE.halfWidth, -SLIT_HALF_HEIGHT, SLIT_HALF_HEIGHT),
    box(-PLATE.halfWidth, PLATE.halfWidth, SLIT_HALF_HEIGHT, PLATE.halfHeight),
    box(-PLATE.halfWidth, PLATE.halfWidth, -PLATE.halfHeight, -SLIT_HALF_HEIGHT),
  ];
  const plateGeometry = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  if (!plateGeometry) throw new Error('Falha ao montar a placa das fendas');
  geometries.push(plateGeometry);
  const plate = new THREE.Mesh(plateGeometry, materials.anodizedAluminum);
  plate.castShadow = true;
  plate.receiveShadow = true;
  group.add(plate);

  // --- Moldura do porta-placa ----------------------------------------------------
  // Aro chanfrado em volta da chapa, com quatro parafusos de latão na face do
  // canhão: a chapa fica presa como num porta-filtro de bancada óptica.
  {
    const kit = new HardwareKit();
    const border = 0.022;
    const depth = PLATE.thickness + 0.01;
    const facing = new THREE.Matrix4().makeRotationY(-Math.PI / 2);
    screenBezel(kit, facing.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -depth / 2)), {
      width: PLATE.halfWidth * 2,
      height: PLATE.halfHeight * 2,
      border,
      depth,
      radius: border * 0.9,
    });
    const sz = PLATE.halfWidth + border / 2;
    const sy = PLATE.halfHeight + border / 2;
    for (const [dz, dy] of [
      [-sz, -sy],
      [sz, -sy],
      [-sz, sy],
      [sz, sy],
    ] as const) {
      capScrew(kit, facing.clone().multiply(new THREE.Matrix4().makeTranslation(dz, dy, depth / 2 + 0.003)), 0.0055, 'brass', false);
    }
    const frame = kit.build(materials, 'slit-plate-frame');
    geometries.push(...groupGeometries(frame));
    group.add(frame);
  }

  // --- Tampas deslizantes, do lado do canhão ---------------------------------
  // Fechada, a tampa cobre a fenda; aberta, desliza para fora, sobre a chapa.
  const coverWidth = slitWidth + 0.03;
  const coverGeometry = new THREE.BoxGeometry(0.006, SLIT_HALF_HEIGHT * 2 + 0.02, coverWidth);
  geometries.push(coverGeometry);
  const covers = new THREE.InstancedMesh(coverGeometry, materials.brushedBrass, 2);
  covers.castShadow = true;
  covers.frustumCulled = false;
  group.add(covers);
  const coverOpen: Record<SlitSide, number> = { left: 1, right: 1 };
  const coverTarget: Record<SlitSide, number> = { left: 1, right: 1 };
  const coverMatrix = new THREE.Matrix4();
  const placeCovers = (): void => {
    (['left', 'right'] as const).forEach((side, index) => {
      // 0 = fechada (sobre a fenda), 1 = aberta (afastada para a borda).
      const outward = side === 'left' ? -1 : 1;
      const slide = coverOpen[side] * (coverWidth + 0.035) * outward;
      coverMatrix.makeTranslation(-PLATE.thickness / 2 - 0.004, 0, slitZ[side] + slide);
      covers.setMatrixAt(index, coverMatrix);
    });
    covers.instanceMatrix.needsUpdate = true;
  };
  placeCovers();

  // --- Detectores: uma bobina atrás de cada fenda e um LED em cima ------------
  const coilGeometry = new THREE.TorusGeometry(0.026, 0.006, 10, 36).rotateY(Math.PI / 2);
  geometries.push(coilGeometry);
  const coils = new THREE.InstancedMesh(coilGeometry, materials.brushedBrass, 2);
  coils.castShadow = true;
  coils.frustumCulled = false;
  group.add(coils);

  const housingGeometry = new THREE.BoxGeometry(0.03, 0.03, 0.045);
  geometries.push(housingGeometry);
  const housings = new THREE.InstancedMesh(housingGeometry, materials.anodizedAluminum, 2);
  housings.frustumCulled = false;
  group.add(housings);

  const ledGeometry = new THREE.SphereGeometry(0.009, 14, 10);
  geometries.push(ledGeometry);
  const ledMaterial = new THREE.MeshBasicMaterial({ vertexColors: false, toneMapped: false });
  owned.push(ledMaterial);
  const leds = new THREE.InstancedMesh(ledGeometry, ledMaterial, 2);
  leds.frustumCulled = false;
  leds.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(6), 3);
  group.add(leds);
  glowing.push(leds);

  const matrix = new THREE.Matrix4();
  (['left', 'right'] as const).forEach((side, index) => {
    const x = PLATE.thickness / 2 + 0.03;
    matrix.makeTranslation(x, 0, slitZ[side]);
    coils.setMatrixAt(index, matrix);
    matrix.makeTranslation(x, 0.05, slitZ[side]);
    housings.setMatrixAt(index, matrix);
    matrix.makeTranslation(x, 0.072, slitZ[side]);
    leds.setMatrixAt(index, matrix);
  });
  coils.instanceMatrix.needsUpdate = true;
  housings.instanceMatrix.needsUpdate = true;
  leds.instanceMatrix.needsUpdate = true;

  let detectorsOn = false;
  const flashLevel: Record<SlitSide, number> = { left: 0, right: 0 };
  const off = new THREE.Color(0x1a1d24);
  const idle = new THREE.Color(0x7a1414);
  const hot = new THREE.Color(0xff4040).multiplyScalar(3);
  const color = new THREE.Color();
  const paintLeds = (): void => {
    (['left', 'right'] as const).forEach((side, index) => {
      if (!detectorsOn) color.copy(off);
      else color.copy(idle).lerp(hot, flashLevel[side]);
      leds.setColorAt(index, color);
    });
    if (leds.instanceColor) leds.instanceColor.needsUpdate = true;
  };
  paintLeds();

  // Os detectores só aparecem ligados; desligados ficam a bobina e o LED apagado.
  return {
    group,
    glowing,
    slitZ,
    slitHalfHeight: SLIT_HALF_HEIGHT,

    setOpen(left: boolean, right: boolean): void {
      coverTarget.left = left ? 1 : 0;
      coverTarget.right = right ? 1 : 0;
    },

    setDetectors(on: boolean): void {
      detectorsOn = on;
      paintLeds();
    },

    flash(side: SlitSide): void {
      if (!detectorsOn) return;
      flashLevel[side] = 1;
    },

    update(dt: number): void {
      let moved = false;
      for (const side of ['left', 'right'] as const) {
        const target = coverTarget[side];
        if (coverOpen[side] !== target) {
          const step = dt / 0.35;
          coverOpen[side] =
            target > coverOpen[side]
              ? Math.min(target, coverOpen[side] + step)
              : Math.max(target, coverOpen[side] - step);
          moved = true;
        }
        if (flashLevel[side] > 0) flashLevel[side] = Math.max(0, flashLevel[side] - dt * 5);
      }
      if (moved) placeCovers();
      paintLeds();
    },

    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const material of owned) material.dispose();
      group.clear();
    },
  };
}
