import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../scene/materials';
import { BARRIER_DEPTH, COLLECTOR_X, NOZZLE_X, SCENE_PER_EV, SCENE_PER_NM } from './layout';

/**
 * O muro de energia e o "diagrama" em volta dele (ADR 0011), no referencial
 * de `layout.ts`:
 *
 * - **muro**: um bloco translúcido violeta, de altura V₀ e espessura a, com
 *   bordas acesas e linhas de varredura, como um campo de força;
 * - **pedestal**: o chão escuro do diagrama, com uma linha acesa no nível de
 *   0 eV, de onde o canhão sai e onde o coletor fica;
 * - **régua**: escala vertical em eV ao lado do muro;
 * - **linha de energia**: tracejado na altura da energia do elétron, que é
 *   por onde o feixe corre.
 */

export interface Barrier {
  readonly group: THREE.Group;
  readonly glowing: THREE.Object3D[];
  /** Âncora da etiqueta, no alto do muro. */
  readonly top: THREE.Object3D;
  /** Âncora da etiqueta da energia, na ponta esquerda da linha. */
  readonly energyAnchor: THREE.Object3D;
  setSize(heightEv: number, widthM: number): void;
  setEnergy(energyEv: number): void;
  update(elapsed: number): void;
  dispose(): void;
}

export interface BarrierOptions {
  readonly materials: MaterialLibrary;
  /** Altura do nível de 0 eV acima do tampo, m: dá a altura do pedestal. */
  readonly baseAboveTop: number;
}

export function createBarrier({ materials, baseAboveTop }: BarrierOptions): Barrier {
  const group = new THREE.Group();
  group.name = 'tunneling-barrier';
  const geometries: THREE.BufferGeometry[] = [];
  const owned: (THREE.Material | THREE.Texture)[] = [];
  const glowing: THREE.Object3D[] = [];

  // --- Muro -------------------------------------------------------------------
  // Caixa unitária com o canto em (0, 0): escalada para a × V₀.
  const wallGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0);
  geometries.push(wallGeometry);
  const wallMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSize: { value: new THREE.Vector2(0.16, 0.24) } },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec2 uSize;
      varying vec3 vLocal;
      void main() {
        // Bordas acesas: perto das arestas em x e em y (em metros de cena).
        vec2 meters = vLocal.xy * uSize;
        vec2 toEdge = min(meters, uSize - meters);
        float edge = 1.0 - smoothstep(0.0, 0.012, min(toEdge.x, toEdge.y));
        float topGlow = 1.0 - smoothstep(0.0, 0.02, uSize.y - meters.y);
        // Linhas de varredura subindo devagar.
        float scan = 0.5 + 0.5 * sin((meters.y * 90.0) - uTime * 2.2);
        vec3 color = vec3(0.55, 0.32, 1.0);
        float alpha = 0.16 + 0.07 * scan + 0.55 * edge + 0.35 * topGlow;
        gl_FragColor = vec4(color * (0.6 + 0.9 * (edge + topGlow)), clamp(alpha, 0.0, 0.9));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  owned.push(wallMaterial);
  const wall = new THREE.Mesh(wallGeometry, wallMaterial);
  wall.name = 'tunneling-wall';
  wall.renderOrder = 3;
  group.add(wall);
  glowing.push(wall);

  // --- Pedestal: o chão do diagrama, com a linha de 0 eV -----------------------
  const floorFrom = NOZZLE_X + 0.05;
  const floorTo = COLLECTOR_X + 0.12;
  const pedestalGeometry = new THREE.BoxGeometry(floorTo - floorFrom, baseAboveTop, 0.4).translate(
    (floorFrom + floorTo) / 2,
    -baseAboveTop / 2,
    0,
  );
  geometries.push(pedestalGeometry);
  const pedestal = new THREE.Mesh(pedestalGeometry, materials.benchBody);
  pedestal.receiveShadow = true;
  pedestal.castShadow = true;
  group.add(pedestal);
  const zeroLineMaterial = new THREE.MeshBasicMaterial({ color: 0x7c5cff, toneMapped: false });
  owned.push(zeroLineMaterial);
  const zeroLineGeometry = mergeGeometries([
    new THREE.BoxGeometry(floorTo - floorFrom, 0.004, 0.004).translate(
      (floorFrom + floorTo) / 2,
      0.001,
      0.2,
    ),
    new THREE.BoxGeometry(floorTo - floorFrom, 0.004, 0.004).translate(
      (floorFrom + floorTo) / 2,
      0.001,
      -0.2,
    ),
  ]);
  if (!zeroLineGeometry) throw new Error('Falha ao montar a linha de 0 eV');
  geometries.push(zeroLineGeometry);
  const zeroLine = new THREE.Mesh(zeroLineGeometry, zeroLineMaterial);
  group.add(zeroLine);
  glowing.push(zeroLine);

  // --- Régua de energia ----------------------------------------------------------
  const rulerEv = 4.5;
  // Desenhada em 128×512 "pontos", com 4 pixels por ponto: a régua fica
  // nítida mesmo vista de perto e de lado (com a filtragem anisotrópica).
  const RULER_DPR = 4;
  const canvas = document.createElement('canvas');
  canvas.width = 128 * RULER_DPR;
  canvas.height = 512 * RULER_DPR;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para a régua');
  ctx.scale(RULER_DPR, RULER_DPR);
  const rulerW = canvas.width / RULER_DPR;
  const rulerH = canvas.height / RULER_DPR;
  const drawRuler = (): void => {
    ctx.clearRect(0, 0, rulerW, rulerH);
    ctx.fillStyle = 'rgba(14, 18, 30, 0.75)';
    ctx.fillRect(0, 0, rulerW, rulerH);
    ctx.strokeStyle = '#b9a6ff';
    ctx.fillStyle = '#d8ccff';
    ctx.font = '700 34px "DM Mono", ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    for (let ev = 0; ev <= rulerEv + 1e-6; ev += 0.5) {
      const y = rulerH - (ev / rulerEv) * (rulerH - 16) - 8;
      const major = Math.abs(ev - Math.round(ev)) < 1e-6;
      ctx.lineWidth = major ? 5 : 3;
      ctx.beginPath();
      ctx.moveTo(rulerW - (major ? 46 : 26), y);
      ctx.lineTo(rulerW, y);
      ctx.stroke();
      if (major) ctx.fillText(`${ev}`, 14, y);
    }
    ctx.font = '700 26px "DM Mono", ui-monospace, monospace';
    ctx.fillText('eV', 12, 24);
  };
  drawRuler();
  const rulerTexture = new THREE.CanvasTexture(canvas);
  rulerTexture.colorSpace = THREE.SRGBColorSpace;
  rulerTexture.anisotropy = 8;
  // Se a DM Mono ainda não carregou, a régua sai com a fonte reserva: redesenha.
  void document.fonts?.ready.then(() => {
    drawRuler();
    rulerTexture.needsUpdate = true;
  });
  owned.push(rulerTexture);
  const rulerMaterial = new THREE.MeshBasicMaterial({
    map: rulerTexture,
    transparent: true,
    toneMapped: false,
  });
  owned.push(rulerMaterial);
  const rulerHeight = rulerEv * SCENE_PER_EV;
  const rulerGeometry = new THREE.PlaneGeometry(rulerHeight / 4, rulerHeight).translate(
    -0.1,
    rulerHeight / 2,
    -BARRIER_DEPTH / 2,
  );
  geometries.push(rulerGeometry);
  group.add(new THREE.Mesh(rulerGeometry, rulerMaterial));

  // --- Linha da energia do elétron ------------------------------------------------
  const lineMaterial = new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: /* glsl */ `
      varying float vX;
      void main() {
        vX = position.x;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vX;
      void main() {
        float dash = step(0.5, fract(vX * 30.0));
        gl_FragColor = vec4(vec3(1.0, 0.82, 0.45) * dash * 0.8, dash * 0.8);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  owned.push(lineMaterial);
  const lineGeometry = new THREE.PlaneGeometry(COLLECTOR_X - NOZZLE_X, 0.003).translate(
    (NOZZLE_X + COLLECTOR_X) / 2,
    0,
    -0.03,
  );
  geometries.push(lineGeometry);
  const energyLine = new THREE.Mesh(lineGeometry, lineMaterial);
  group.add(energyLine);

  const top = new THREE.Object3D();
  group.add(top);
  const energyAnchor = new THREE.Object3D();
  energyAnchor.position.x = NOZZLE_X + 0.12;
  group.add(energyAnchor);

  return {
    group,
    glowing,
    top,
    energyAnchor,

    setSize(heightEv: number, widthM: number): void {
      const w = (widthM / 1e-9) * SCENE_PER_NM;
      const h = heightEv * SCENE_PER_EV;
      wall.scale.set(w, h, BARRIER_DEPTH);
      (wallMaterial.uniforms.uSize!.value as THREE.Vector2).set(w, h);
      top.position.set(w / 2, h + 0.04, 0);
    },

    setEnergy(energyEv: number): void {
      energyLine.position.y = energyEv * SCENE_PER_EV;
      energyAnchor.position.y = energyEv * SCENE_PER_EV + 0.05;
    },

    update(elapsed: number): void {
      wallMaterial.uniforms.uTime!.value = elapsed;
    },

    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const item of owned) item.dispose();
      group.clear();
    },
  };
}
