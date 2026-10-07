import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PlateField, PlateShape } from '../../optics/acoustics/chladni';
import type { MaterialLibrary } from '../../scene/materials';
import { brushedMetalRoughness, nameplateTexture } from '../../scene/textures/procedural';

/**
 * A placa de Chladni na bancada (ADR 0018): aço escovado sobre a haste de um
 * excitador eletromecânico, e a areia por cima.
 *
 * - A placa é desenhada maior que a de verdade (`DRAW_SCALE`): 24 cm de lado
 *   viram 84 cm.
 * - A vibração aparece em câmera lenta e ampliada: a placa real vibra
 *   centenas de vezes por segundo, com amplitude de micrômetros.
 * - A areia é uma nuvem de pontos (até 40 mil grãos, um draw call); as
 *   posições vêm da simulação do motor (`stepSand`) e cada grão acompanha a
 *   altura da placa embaixo dele.
 */

/** Quantas vezes a placa é desenhada maior que a real. */
export const DRAW_SCALE = 3.5;
/** Altura da face da placa acima do tampo, m. */
export const PLATE_HEIGHT = 0.3;
/** Deslocamento desenhado para a amplitude 1 (a de pico na ressonância), m. */
const VIBRATION_DRAWN = 0.011;
/** Câmera lenta: oscilações desenhadas por segundo. */
const SLOW_MOTION_HZ = 1.6;

export interface PlateRig {
  readonly group: THREE.Group;
  /** Centro da placa, para etiquetas e câmeras. */
  readonly center: THREE.Object3D;
  readonly glowing: THREE.Object3D[];
  setShape(shape: PlateShape, size: number): void;
  setField(field: PlateField | null): void;
  /** Posições dos grãos (x, y intercalados, m na placa real). */
  setSand(positions: Float32Array): void;
  update(elapsed: number): void;
  dispose(): void;
}

export function createPlateRig(materials: MaterialLibrary): PlateRig {
  const group = new THREE.Group();
  group.name = 'chladni-plate';
  const geometries: THREE.BufferGeometry[] = [];
  const owned: (THREE.Material | THREE.Texture)[] = [];
  const glowing: THREE.Object3D[] = [];

  const center = new THREE.Object3D();
  center.position.y = PLATE_HEIGHT;
  group.add(center);

  // --- Aço escovado ---------------------------------------------------------------
  // Aço com pintura preta fosca, como nas placas de demonstração: a areia
  // clara aparece bem contra ela.
  const steel = new THREE.MeshPhysicalMaterial({
    color: 0x1c1f24,
    metalness: 0.55,
    roughness: 0.5,
    roughnessMap: brushedMetalRoughness(),
    anisotropy: 0.3,
    clearcoat: 0.35,
    clearcoatRoughness: 0.35,
    envMapIntensity: 0.6,
    side: THREE.DoubleSide,
  });
  owned.push(steel);

  const squareGeometry = new THREE.PlaneGeometry(1, 1, 112, 112).rotateX(-Math.PI / 2);
  const circleGeometry = new THREE.RingGeometry(0.0001, 1, 160, 56).rotateX(-Math.PI / 2);
  geometries.push(squareGeometry, circleGeometry);
  const squareRest = Float32Array.from(squareGeometry.attributes.position!.array as Float32Array);
  const circleRest = Float32Array.from(circleGeometry.attributes.position!.array as Float32Array);
  const plate = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(squareGeometry, steel);
  plate.name = 'chladni-steel';
  plate.castShadow = true;
  plate.receiveShadow = true;
  center.add(plate);

  // --- Excitador e haste ----------------------------------------------------------
  const bodyGeometry = mergeGeometries([
    new THREE.CylinderGeometry(0.12, 0.13, 0.15, 48).translate(0, 0.075, 0),
    new THREE.CylinderGeometry(0.135, 0.135, 0.012, 48).translate(0, 0.006, 0),
  ]);
  if (!bodyGeometry) throw new Error('Falha ao montar o excitador');
  geometries.push(bodyGeometry);
  const body = new THREE.Mesh(bodyGeometry, materials.darkSteel);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const brassGeometry = mergeGeometries([
    new THREE.TorusGeometry(0.122, 0.008, 12, 64).rotateX(Math.PI / 2).translate(0, 0.15, 0),
    new THREE.CylinderGeometry(0.035, 0.045, 0.02, 32).translate(0, 0.16, 0),
  ]);
  if (!brassGeometry) throw new Error('Falha ao montar o excitador');
  geometries.push(brassGeometry);
  const brass = new THREE.Mesh(brassGeometry, materials.brushedBrass);
  group.add(brass);

  const rodGeometry = new THREE.CylinderGeometry(0.009, 0.009, PLATE_HEIGHT - 0.17, 16).translate(
    0,
    (PLATE_HEIGHT - 0.17) / 2 + 0.17,
    0,
  );
  geometries.push(rodGeometry);
  const rod = new THREE.Mesh(rodGeometry, materials.anodizedAluminum);
  group.add(rod);

  // Porca de latão no centro da placa; sobe e desce com ela.
  const nutGeometry = new THREE.CylinderGeometry(0.018, 0.018, 0.012, 6).translate(0, 0.006, 0);
  geometries.push(nutGeometry);
  const nut = new THREE.Mesh(nutGeometry, materials.brushedBrass);
  center.add(nut);

  // Placa dourada na frente do excitador.
  const plateNameGeometry = new THREE.PlaneGeometry(0.22, 0.22 * (352 / 1024));
  geometries.push(plateNameGeometry);
  const nameMaterial = new THREE.MeshStandardMaterial({
    map: nameplateTexture('@juliophisico', 'FIGURAS DE CHLADNI · AÇO 0,8 mm'),
    metalness: 0.75,
    roughness: 0.38,
    envMapIntensity: 0.6,
  });
  owned.push(nameMaterial);
  const nameplate = new THREE.Mesh(plateNameGeometry, nameMaterial);
  nameplate.name = 'nameplate';
  nameplate.position.set(0, 0.075, 0.131);
  group.add(nameplate);

  // --- Areia ------------------------------------------------------------------------
  const sprite = document.createElement('canvas');
  sprite.width = 64;
  sprite.height = 64;
  const spriteContext = sprite.getContext('2d');
  if (!spriteContext) throw new Error('Canvas 2D indisponível para a areia');
  const grain = spriteContext.createRadialGradient(28, 26, 2, 32, 32, 30);
  grain.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grain.addColorStop(0.55, 'rgba(225, 225, 225, 1)');
  grain.addColorStop(0.85, 'rgba(150, 150, 150, 1)');
  grain.addColorStop(1, 'rgba(120, 120, 120, 0)');
  spriteContext.fillStyle = grain;
  spriteContext.fillRect(0, 0, 64, 64);
  const spriteTexture = new THREE.CanvasTexture(sprite);
  spriteTexture.colorSpace = THREE.SRGBColorSpace;
  owned.push(spriteTexture);
  const sandGeometry = new THREE.BufferGeometry();
  geometries.push(sandGeometry);
  const sandMaterial = new THREE.PointsMaterial({
    size: 0.0075,
    map: spriteTexture,
    vertexColors: true,
    alphaTest: 0.4,
    sizeAttenuation: true,
  });
  owned.push(sandMaterial);
  const sand = new THREE.Points(sandGeometry, sandMaterial);
  sand.name = 'chladni-sand';
  sand.frustumCulled = false;
  center.add(sand);

  let shape: PlateShape = 'square';
  let field: PlateField | null = null;
  let grains: Float32Array = new Float32Array(0);
  /** Metade do tamanho real da placa (meio lado ou raio), m. */
  let half = 0.12;

  function rebuildSandBuffers(count: number): void {
    const position = new Float32Array(count * 3);
    const color = new Float32Array(count * 3);
    let state = 1234567;
    const random = (): number => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0xffffffff;
    };
    for (let i = 0; i < count; i += 1) {
      const tone = 0.78 + random() * 0.22;
      color[i * 3] = 1.0 * tone;
      color[i * 3 + 1] = 0.9 * tone;
      color[i * 3 + 2] = 0.68 * tone;
    }
    sandGeometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    sandGeometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  }

  return {
    group,
    center,
    glowing,

    setShape(next: PlateShape, size: number): void {
      shape = next;
      half = next === 'square' ? size / 2 : size;
      plate.geometry = next === 'square' ? squareGeometry : circleGeometry;
      // As geometrias são de tamanho 1 (lado ou raio): a escala as leva ao desenho.
      const drawn = size * DRAW_SCALE;
      plate.scale.set(drawn, 1, drawn);
    },

    setField(next: PlateField | null): void {
      field = next;
    },

    setSand(positions: Float32Array): void {
      if (positions.length !== grains.length) rebuildSandBuffers(positions.length / 2);
      grains = positions;
    },

    update(elapsed: number): void {
      const phase = elapsed * 2 * Math.PI * SLOW_MOTION_HZ;
      const geometry = plate.geometry;
      const rest = shape === 'square' ? squareRest : circleRest;
      const position = geometry.attributes.position as THREE.BufferAttribute;
      const array = position.array as Float32Array;
      // Fora da ressonância a placa quase não se mexe — e o desenho também não.
      const lift = (x: number, y: number): number => (field ? field.displacementAt(x, y, phase) * VIBRATION_DRAWN : 0);
      const physical = shape === 'square' ? 2 * half : half;
      for (let i = 0; i < array.length; i += 3) {
        // Vértice de tamanho 1 → coordenadas da placa real (y da placa = −z da cena).
        const x = rest[i]! * physical;
        const y = -rest[i + 2]! * physical;
        array[i + 1] = lift(x, y);
      }
      position.needsUpdate = true;
      geometry.computeVertexNormals();
      nut.position.y = lift(0, 0);

      const sandPosition = sandGeometry.attributes.position as THREE.BufferAttribute | undefined;
      if (sandPosition) {
        const target = sandPosition.array as Float32Array;
        for (let i = 0, j = 0; i < grains.length; i += 2, j += 3) {
          const x = grains[i]!;
          const y = grains[i + 1]!;
          target[j] = x * DRAW_SCALE;
          target[j + 1] = lift(x, y) + 0.0035;
          target[j + 2] = -y * DRAW_SCALE;
        }
        sandPosition.needsUpdate = true;
      }
    },

    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const item of owned) item.dispose();
      group.clear();
    },
  };
}
