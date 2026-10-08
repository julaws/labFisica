import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  HardwareKit,
  bncJack,
  groupGeometries,
  hardwareMaterial,
  indicatorLed,
  monitorStand,
  opticalPost,
  pose,
  screenBezel,
} from '../../scene/hardware';
import type { MaterialLibrary } from '../../scene/materials';
import { COLLECTOR_X } from './layout';

/**
 * Coletor e contador (ADR 0011): um copo de Faraday na altura do feixe, do
 * outro lado do muro, com um anel que pisca a cada elétron que tunelou, e um
 * painel que conta os que tunelaram e os que refletiram — a fração medida
 * converge para o T do motor, elétron a elétron.
 */

export interface CounterReading {
  readonly title: string;
  readonly rows: readonly (readonly [string, string])[];
  /** Linha de destaque embaixo (a corrente de tunelamento). */
  readonly footer: string;
}

export interface Collector {
  readonly group: THREE.Group;
  readonly glowing: THREE.Object3D[];
  readonly labelAnchor: THREE.Object3D;
  setBaseline(y: number): void;
  /** Pisca o anel: um elétron chegou. */
  flash(): void;
  showReading(reading: CounterReading): void;
  update(dt: number): void;
  dispose(): void;
}

export interface CollectorOptions {
  readonly materials: MaterialLibrary;
}

export function createCollector({ materials }: CollectorOptions): Collector {
  const group = new THREE.Group();
  group.name = 'tunneling-collector';
  const geometries: THREE.BufferGeometry[] = [];
  const owned: (THREE.Material | THREE.Texture)[] = [];
  const glowing: THREE.Object3D[] = [];

  // Copo de Faraday torneado: boca com aba, fundo fechado e um conector BNC
  // atrás, isolado por um anel de porcelana e preso por uma braçadeira. O
  // conjunto sobe e desce com o feixe.
  const cup = new THREE.Group();
  group.add(cup);
  const copper = new THREE.MeshStandardMaterial({
    color: 0xc27a4a,
    metalness: 0.9,
    roughness: 0.3,
    side: THREE.DoubleSide,
  });
  owned.push(copper);
  const cupGeometry = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.049, 0.002),
      new THREE.Vector2(0.06, 0),
      new THREE.Vector2(0.061, 0.006),
      new THREE.Vector2(0.055, 0.012),
      new THREE.Vector2(0.055, 0.112),
      new THREE.Vector2(0.05, 0.12),
      new THREE.Vector2(0, 0.122),
    ],
    48,
  ).rotateZ(-Math.PI / 2);
  geometries.push(cupGeometry);
  const cupMesh = new THREE.Mesh(cupGeometry, copper);
  cupMesh.castShadow = true;
  cup.add(cupMesh);
  {
    const kit = new HardwareKit();
    // Isolador de porcelana e braçadeira anodizada atrás do copo.
    kit.add('ceramic', new THREE.CylinderGeometry(0.042, 0.042, 0.018, 40).rotateZ(Math.PI / 2).translate(0.131, 0, 0));
    kit.add(
      'anodized',
      new THREE.LatheGeometry(
        [new THREE.Vector2(0.055, -0.012), new THREE.Vector2(0.066, -0.012), new THREE.Vector2(0.066, 0.012), new THREE.Vector2(0.055, 0.012)],
        48,
      )
        .rotateZ(-Math.PI / 2)
        .translate(0.09, 0, 0),
    );
    kit.add('anodized', new RoundedBoxGeometry(0.03, 0.03, 0.034, 2, 0.004).translate(0.09, -0.07, 0));
    bncJack(kit, pose(0.14, 0, 0, Math.PI / 2), 1.4);
    const mount = kit.build(materials, 'faraday-cup-mount');
    geometries.push(...groupGeometries(mount));
    cup.add(mount);
  }

  const ringGeometry = new THREE.TorusGeometry(0.058, 0.006, 10, 40).rotateY(Math.PI / 2);
  geometries.push(ringGeometry);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffd36b, toneMapped: false });
  owned.push(ringMaterial);
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  cup.add(ring);
  glowing.push(ring);

  // Poste de aço que estica com a altura do feixe, saindo de um porta-poste
  // fixo no pedestal (com a base aparafusada e o cabo coaxial até o contador).
  const stemGeometry = new THREE.CylinderGeometry(0.0085, 0.0085, 1, 20).translate(0, -0.5, 0);
  geometries.push(stemGeometry);
  const stem = new THREE.Mesh(stemGeometry, hardwareMaterial(materials, 'steel'));
  stem.castShadow = true;
  stem.position.x = 0.09;
  cup.add(stem);
  {
    const kit = new HardwareKit();
    opticalPost(kit, pose(COLLECTOR_X + 0.09, 0, 0), { top: 0.07, holderHeight: 0.06, postRadius: 0.0085 });
    const cable = new THREE.CatmullRomCurve3([
      new THREE.Vector3(COLLECTOR_X + 0.09, 0.03, -0.02),
      new THREE.Vector3(COLLECTOR_X + 0.07, 0.006, -0.08),
      new THREE.Vector3(COLLECTOR_X - 0.05, 0.005, -0.16),
      new THREE.Vector3(COLLECTOR_X - 0.15, 0.006, -0.2),
    ]);
    kit.add('rubber', new THREE.TubeGeometry(cable, 32, 0.0045, 8, false));
    const holder = kit.build(materials, 'faraday-cup-holder');
    geometries.push(...groupGeometries(holder));
    group.add(holder);
  }

  // --- Painel de contagem -----------------------------------------------------------
  // Desenhado em 768×480 "pontos", com 2 pixels por ponto, e com filtragem
  // anisotrópica: o painel fica de lado para a câmera e borrava sem isso.
  const PANEL_DPR = 2;
  const panelW = 768;
  const panelH = 480;
  const canvas = document.createElement('canvas');
  canvas.width = panelW * PANEL_DPR;
  canvas.height = panelH * PANEL_DPR;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para o contador');
  ctx.scale(PANEL_DPR, PANEL_DPR);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  owned.push(texture);
  const screenMaterial = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  owned.push(screenMaterial);
  const screenWidth = 0.46;
  const screenHeight = screenWidth * (panelH / panelW);
  const screenGeometry = new THREE.PlaneGeometry(screenWidth, screenHeight);
  geometries.push(screenGeometry);
  const screen = new THREE.Mesh(screenGeometry, screenMaterial);
  const display = new THREE.Group();
  display.add(screen);
  {
    // Gabinete de monitor: caixa arredondada, moldura chanfrada, a corcunda
    // da eletrônica atrás, pé de monitor até o pedestal e o LED de ligado.
    const kit = new HardwareKit();
    const lift = 0.3;
    kit.add('case', new RoundedBoxGeometry(screenWidth + 0.05, screenHeight + 0.05, 0.03, 3, 0.01).translate(0, 0, -0.017));
    screenBezel(kit, pose(0, 0, -0.004), { width: screenWidth, height: screenHeight, border: 0.018, depth: 0.006 });
    kit.add('case', new RoundedBoxGeometry(screenWidth * 0.6, screenHeight * 0.6, 0.03, 3, 0.01).translate(0, 0.005, -0.045));
    monitorStand(kit, pose(0, -lift, -0.05), { height: lift - 0.01, baseWidth: 0.2, baseDepth: 0.13 });
    const housing = kit.build(materials, 'counter-housing');
    geometries.push(...groupGeometries(housing));
    display.add(housing);
    const led = indicatorLed(0xffd36b, 0.003);
    led.position.set(screenWidth / 2 - 0.004, -screenHeight / 2 - 0.011, 0.004);
    geometries.push(led.geometry);
    owned.push(led.material as THREE.Material);
    display.add(led);
  }
  display.position.set(COLLECTOR_X - 0.16, 0.3, -0.22);
  display.rotation.y = -0.25;
  group.add(display);

  const labelAnchor = new THREE.Object3D();
  labelAnchor.position.set(COLLECTOR_X + 0.06, 0, 0);
  group.add(labelAnchor);

  cup.position.x = COLLECTOR_X;
  let level = 0;

  return {
    group,
    glowing,
    labelAnchor,

    setBaseline(y: number): void {
      cup.position.y = y;
      labelAnchor.position.y = y + 0.1;
      stem.scale.y = Math.max(y, 0.01);
    },

    flash(): void {
      level = 1;
    },

    showReading(reading: CounterReading): void {
      const w = panelW;
      const h = panelH;
      ctx.fillStyle = '#0b1020';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255, 211, 107, 0.6)';
      ctx.lineWidth = 6;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      ctx.fillStyle = '#ffd36b';
      ctx.font = '700 44px Outfit, ui-sans-serif, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(reading.title, 40, 62);
      ctx.font = '600 42px "DM Mono", ui-monospace, monospace';
      reading.rows.forEach(([label, value], index) => {
        const y = 138 + index * 68;
        ctx.fillStyle = '#b8c6e2';
        ctx.fillText(label, 40, y);
        ctx.fillStyle = '#eef4ff';
        ctx.textAlign = 'right';
        ctx.fillText(value, w - 40, y);
        ctx.textAlign = 'left';
      });
      ctx.fillStyle = '#8ee8ff';
      ctx.font = '700 46px "DM Mono", ui-monospace, monospace';
      ctx.fillText(reading.footer, 40, h - 52);
      texture.needsUpdate = true;
    },

    update(dt: number): void {
      level = Math.max(0, level - dt * 3);
      ringMaterial.color.setRGB(1, 0.83, 0.42).multiplyScalar(0.35 + level * 2.5);
    },

    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const item of owned) item.dispose();
      group.clear();
    },
  };
}
