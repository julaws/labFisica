import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HardwareKit, capScrew, groupGeometries, opticalPost, pose } from './hardware';
import type { MaterialLibrary } from './materials';
import { PALETTE } from './materials';
import { nameplateTexture } from './textures/procedural';

/**
 * Canhão de elétrons (ADR 0009 e 0010), usado por mais de um experimento:
 * corpo torneado de alumínio anodizado, com flanges e frisos, três bobinas de
 * cobre enroladas em carretéis (as lentes magnéticas que focalizam o feixe),
 * o bocal cônico na frente e, atrás, o isolador de porcelana com o cabo de
 * alta tensão descendo até a bancada. O tubo vai preso por duas braçadeiras
 * em postes ópticos sobre uma base; a placa dourada fica na frente da base.
 *
 * O eixo do feixe é +x; a origem do grupo é a ponta do bocal, de onde os
 * elétrons saem.
 */

export interface ElectronGun {
  readonly group: THREE.Group;
  /** Brilho do catodo e do bocal, para o bloom. */
  readonly glowing: THREE.Object3D[];
  /** Liga e desliga o brilho do bocal (feixe visível ou não). */
  setFiring(on: boolean): void;
  /** Cor do brilho do bocal. */
  setTint(hex: number): void;
  dispose(): void;
}

export interface ElectronGunOptions {
  readonly materials: MaterialLibrary;
  /** Altura do eixo acima do carrinho, em unidades de cena. */
  readonly axisHeight: number;
  /** Segunda linha da placa dourada (a primeira é sempre @juliophisico). */
  readonly nameplate?: string;
}

const LENGTH = 0.42;
const RADIUS = 0.065;
/** Fundo do corpo (a tampa traseira), em x. */
const BACK = -0.05 - LENGTH - 0.03;
const BASE = { width: 0.36, height: 0.1, depth: 0.2, x: -0.25 } as const;

/** Perfil (raio, posição no eixo) do corpo torneado, de trás para a frente. */
function bodyProfile(): THREE.Vector2[] {
  const r = RADIUS;
  const points: [number, number][] = [
    [0, BACK - 0.004],
    [r * 0.78, BACK - 0.004],
    [r * 1.14, BACK + 0.006],
    [r * 1.14, BACK + 0.024],
    [r, BACK + 0.03],
  ];
  // Frisos de refrigeração entre as bobinas.
  for (const x of [-0.42, -0.185, -0.075]) {
    points.push([r, x - 0.006], [r * 0.95, x - 0.004], [r * 0.95, x + 0.004], [r, x + 0.006]);
  }
  points.push(
    [r, -0.062],
    [r * 1.12, -0.058],
    [r * 1.12, -0.05],
    [r * 0.8, -0.046],
    [0.019, -0.004],
    [0.014, 0],
    [0, 0],
  );
  // O torno gira em torno de y: (raio, y) → depois o eixo vira +x.
  return points.map(([radius, x]) => new THREE.Vector2(radius, x));
}

/** Lathe em torno de +x a partir de um perfil (raio, x). */
function turned(profile: THREE.Vector2[], segments = 56): THREE.BufferGeometry {
  return new THREE.LatheGeometry(profile, segments).rotateZ(-Math.PI / 2);
}

export function createElectronGun({
  materials,
  axisHeight,
  nameplate = 'CANHÃO DE ELÉTRONS · 50 kV',
}: ElectronGunOptions): ElectronGun {
  const group = new THREE.Group();
  group.name = 'electron-gun';
  const geometries: THREE.BufferGeometry[] = [];
  const owned: THREE.Material[] = [];
  const glowing: THREE.Object3D[] = [];
  const kit = new HardwareKit();

  // --- Corpo torneado --------------------------------------------------------
  kit.add('anodized', turned(bodyProfile()));

  // --- Bobinas: carretel anodizado e enrolamento de cobre com espiras --------
  for (const x of [-0.13, -0.24, -0.35]) {
    const width = 0.05;
    for (const side of [-1, 1]) {
      const flange = new THREE.CylinderGeometry(RADIUS * 1.32, RADIUS * 1.32, 0.005, 48).rotateZ(Math.PI / 2).translate(x + (side * width) / 2, 0, 0);
      kit.add('anodized', flange);
    }
    const core = new THREE.CylinderGeometry(RADIUS * 1.2, RADIUS * 1.2, width - 0.004, 48, 1, true).rotateZ(Math.PI / 2).translate(x, 0, 0);
    kit.add('brass', core);
    const turns = 7;
    for (let i = 0; i < turns; i += 1) {
      const t = x - width / 2 + 0.006 + ((width - 0.012) * i) / (turns - 1);
      kit.add('brass', new THREE.TorusGeometry(RADIUS * 1.2, 0.0034, 6, 48).rotateY(Math.PI / 2).translate(t, 0, 0));
    }
  }

  // --- Isolador de alta tensão e cabo -----------------------------------------
  // Porcelana com aletas (as "saias") na tampa traseira, e o cabo grosso que
  // sai dele, faz a curva e desce até a bancada, atrás do canhão.
  const insulator: [number, number][] = [
    [0.022, 0],
    [0.03, 0.004],
  ];
  for (let i = 0; i < 4; i += 1) {
    const y = 0.012 + i * 0.016;
    insulator.push([0.024, y - 0.004], [0.036, y], [0.036, y + 0.003], [0.024, y + 0.007]);
  }
  insulator.push([0.018, 0.078], [0.012, 0.086], [0, 0.088]);
  const ceramic = new THREE.LatheGeometry(
    insulator.map(([r, y]) => new THREE.Vector2(r, y)),
    32,
  )
    .rotateZ(Math.PI / 2)
    .translate(BACK - 0.004, 0, 0);
  kit.add('ceramic', ceramic);
  const cableStart = new THREE.Vector3(BACK - 0.09, 0, 0);
  const floor = -axisHeight + 0.008;
  const cable = new THREE.CatmullRomCurve3([
    cableStart,
    new THREE.Vector3(BACK - 0.13, -0.01, -0.02),
    new THREE.Vector3(BACK - 0.15, floor * 0.55, -0.06),
    new THREE.Vector3(BACK - 0.12, floor + 0.01, -0.12),
    new THREE.Vector3(BACK + 0.06, floor, -0.15),
  ]);
  kit.add('rubber', new THREE.TubeGeometry(cable, 48, 0.0075, 10, false));
  // Prensa-cabo de latão na ponta do isolador.
  kit.add('brass', new THREE.CylinderGeometry(0.012, 0.012, 0.012, 20).rotateZ(Math.PI / 2).translate(BACK - 0.088, 0, 0));

  // --- Suporte: base, postes e braçadeiras ------------------------------------
  const baseTop = -axisHeight + BASE.height;
  kit.add(
    'anodized',
    new RoundedBoxGeometry(BASE.width, BASE.height, BASE.depth, 3, 0.012).translate(BASE.x, -axisHeight + BASE.height / 2, 0),
  );
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    capScrew(kit, pose(BASE.x + dx * (BASE.width / 2 - 0.022), baseTop, dz * (BASE.depth / 2 - 0.022)).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)), 0.006, 'steel', false);
  }
  const clampDrop = 0.016;
  const postTop = -RADIUS - clampDrop - baseTop;
  for (const x of [-0.185, -0.42]) {
    // Braçadeira: anel em volta do tubo e um bloco embaixo para o poste.
    const ring = new THREE.LatheGeometry(
      [new THREE.Vector2(RADIUS * 1.0, -0.012), new THREE.Vector2(RADIUS * 1.13, -0.012), new THREE.Vector2(RADIUS * 1.13, 0.012), new THREE.Vector2(RADIUS * 1.0, 0.012)],
      48,
    )
      .rotateZ(Math.PI / 2)
      .translate(x, 0, 0);
    kit.add('anodized', ring);
    kit.add('anodized', new RoundedBoxGeometry(0.03, clampDrop + 0.012, 0.034, 2, 0.004).translate(x, -RADIUS - clampDrop / 2, 0));
    capScrew(kit, pose(x, -RADIUS * 0.55, RADIUS * 1.13), 0.0045, 'steel', false);
    if (postTop > 0.02) {
      opticalPost(kit, pose(x, baseTop, 0), { top: postTop, base: false, holderHeight: Math.min(0.06, postTop * 0.6), postRadius: 0.0085 });
    }
  }

  const hardware = kit.build(materials, 'electron-gun-body');
  geometries.push(...groupGeometries(hardware));
  group.add(hardware);

  // Bocal aceso: um disco emissivo na saída do feixe.
  const nozzleMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.focus, toneMapped: false });
  owned.push(nozzleMaterial);
  const nozzleGeometry = new THREE.CircleGeometry(0.012, 24).rotateY(Math.PI / 2);
  geometries.push(nozzleGeometry);
  const nozzle = new THREE.Mesh(nozzleGeometry, nozzleMaterial);
  nozzle.position.x = 0.001;
  group.add(nozzle);
  glowing.push(nozzle);

  const plateTexture = nameplateTexture('@juliophisico', nameplate);
  const plateGeometry = new THREE.PlaneGeometry(0.26, 0.26 * (352 / 1024));
  geometries.push(plateGeometry);
  const plateMaterial = new THREE.MeshStandardMaterial({
    map: plateTexture,
    metalness: 0.75,
    roughness: 0.38,
    envMapIntensity: 0.6,
  });
  owned.push(plateMaterial);
  const plate = new THREE.Mesh(plateGeometry, plateMaterial);
  plate.name = 'nameplate';
  // Na frente da base, voltada para quem está diante da bancada (+z).
  plate.position.set(BASE.x, -axisHeight + BASE.height / 2, BASE.depth / 2 + 0.002);
  group.add(plate);

  return {
    group,
    glowing,
    setFiring(on: boolean): void {
      nozzle.visible = on;
    },
    setTint(hex: number): void {
      nozzleMaterial.color.setHex(hex);
    },
    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const material of owned) material.dispose();
      group.clear();
    },
  };
}
