import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Locale } from '../../core/experiment';
import { type Flight, type FlightSample, ORBITAL_SPEED, tsiolkovsky } from '../../optics/mechanics/rocket';
import type { MaterialLibrary } from '../../scene/materials';
import { formatNumber } from '../../ui/i18n';

/**
 * O console do foguete (ADR 0020): quatro telas num painel inclinado.
 *
 * 1. **Momento**, no referencial da Terra: barras do foguete (para cima), do
 *    gás ejetado (para baixo), dos estágios soltos e do impulso da gravidade e
 *    do arrasto, e a soma — zero sem forças externas.
 * 2. **Velocidade × tempo**, com a curva ideal de Tsiolkovsky tracejada (a
 *    distância entre as duas são as perdas) e a meta orbital.
 * 3. **Massa × tempo**, com os degraus das separações.
 * 4. **Δv × razão de massas**: a curva logarítmica v_e·ln(m₀/m_f) e o ponto
 *    de cada estágio.
 */

export interface ConsoleData {
  readonly flight: Flight;
  readonly now: FlightSample;
  /** v_e de cada estágio e as razões de massas (ideais). */
  readonly exhaust: number;
  readonly massRatios: readonly number[];
  readonly stageDeltaV: readonly number[];
  readonly target: boolean;
  /** Velocidade ideal (Tsiolkovsky, sem perdas) em cada instante. */
  readonly ideal: (t: number) => number;
}

export interface RocketConsole {
  readonly group: THREE.Group;
  readonly glowing: THREE.Object3D[];
  readonly anchor: THREE.Object3D;
  draw(data: ConsoleData, locale: Locale): void;
  dispose(): void;
}

const W = 768;
const H = 432;
const CYAN = '#7fe3ff';
const ORANGE = '#ffb45c';
const GOLD = '#ffd36b';
const GREY = '#9fb0d0';
const RED = '#ff7a6b';
const INK = '#e6eaf2';

export function createRocketConsole(materials: MaterialLibrary, quality: 'low' | 'high'): RocketConsole {
  const group = new THREE.Group();
  group.name = 'rocket-console';
  const geometries: THREE.BufferGeometry[] = [];
  const owned: (THREE.Material | THREE.Texture)[] = [];
  const glowing: THREE.Object3D[] = [];
  const scale = quality === 'low' ? 0.7 : 1;

  const screenW = 0.46;
  const screenH = screenW * (H / W);
  const gap = 0.025;
  const panelW = 2 * screenW + 3 * gap;
  const panelH = 2 * screenH + 3 * gap;

  // Painel inclinado sobre um pé.
  const tilt = new THREE.Group();
  tilt.position.set(0, 0.36, 0);
  tilt.rotation.x = -0.32;
  group.add(tilt);
  const body = mergeGeometries([new THREE.BoxGeometry(panelW, panelH, 0.04).translate(0, 0, -0.022)]);
  const stand = mergeGeometries([
    new THREE.BoxGeometry(0.06, 0.3, 0.06).translate(0, 0.15, -0.06),
    new THREE.BoxGeometry(0.4, 0.02, 0.26).translate(0, 0.01, -0.04),
  ]);
  if (!body || !stand) throw new Error('Falha ao montar o console');
  geometries.push(body, stand);
  tilt.add(new THREE.Mesh(body, materials.darkSteel));
  const standMesh = new THREE.Mesh(stand, materials.darkSteel);
  standMesh.castShadow = true;
  group.add(standMesh);

  const screens = [0, 1, 2, 3].map((index) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível para o console');
    ctx.scale(scale, scale);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    owned.push(texture);
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    owned.push(material);
    const geometry = new THREE.PlaneGeometry(screenW, screenH);
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    const column = index % 2;
    const row = Math.floor(index / 2);
    mesh.position.set((column - 0.5) * (screenW + gap), (0.5 - row) * (screenH + gap), 0.001);
    tilt.add(mesh);
    glowing.push(mesh);
    return { ctx, texture };
  });

  const anchor = new THREE.Object3D();
  anchor.position.set(0, panelH / 2 + 0.03, 0);
  tilt.add(anchor);

  const frame = (ctx: CanvasRenderingContext2D, title: string): void => {
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(170, 200, 255, 0.18)';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, W - 12, H - 12);
    ctx.fillStyle = INK;
    ctx.font = '700 28px Outfit, ui-sans-serif, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(title, 24, 34);
  };

  /** Eixos de um gráfico: devolve o mapeamento (x, y) → pixels. */
  const axes = (
    ctx: CanvasRenderingContext2D,
    xMax: number,
    yMax: number,
    xLabel: string,
    yLabel: string,
    locale: Locale,
    xMin = 0,
  ): ((x: number, y: number) => [number, number]) => {
    const left = 92;
    const right = W - 30;
    const top = 70;
    const bottom = H - 62;
    ctx.strokeStyle = 'rgba(170, 200, 255, 0.14)';
    ctx.lineWidth = 1.5;
    ctx.font = '500 20px "DM Mono", ui-monospace, monospace';
    ctx.fillStyle = GREY;
    for (let i = 0; i <= 4; i += 1) {
      const y = bottom - ((bottom - top) * i) / 4;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(formatNumber((yMax * i) / 4, yMax >= 10 ? 0 : 1, locale), left - 10, y);
    }
    for (let i = 0; i <= 4; i += 1) {
      const x = left + ((right - left) * i) / 4;
      ctx.textAlign = 'center';
      ctx.fillText(formatNumber(xMin + ((xMax - xMin) * i) / 4, xMax - xMin >= 10 ? 0 : 1, locale), x, bottom + 22);
    }
    ctx.textAlign = 'right';
    ctx.fillText(xLabel, right, bottom + 46);
    ctx.textAlign = 'left';
    ctx.fillText(yLabel, left, top - 18);
    return (x, y) => [left + ((x - xMin) / (xMax - xMin)) * (right - left), bottom - (y / yMax) * (bottom - top)];
  };

  return {
    group,
    glowing,
    anchor,

    draw(data: ConsoleData, locale: Locale): void {
      const en = locale === 'en';
      const { flight, now } = data;
      const samples = flight.samples;
      const last = samples.at(-1)!;

      // 1. Momento.
      {
        const ctx = screens[0]!.ctx;
        frame(ctx, en ? 'MOMENTUM · Earth frame' : 'MOMENTO · referencial da Terra');
        const bars: [string, number, string][] = [
          [en ? 'rocket' : 'foguete', now.rocketMomentum, CYAN],
          [en ? 'gas' : 'gás', now.gasMomentum, ORANGE],
          [en ? 'stages' : 'estágios', now.droppedMomentum, GREY],
          // A Terra (pela gravidade) e o ar (pelo arrasto) levam o impulso que faltava.
          [en ? 'Earth, air' : 'Terra e ar', -now.externalImpulse, RED],
        ];
        const total = now.rocketMomentum + now.gasMomentum + now.droppedMomentum - now.externalImpulse;
        bars.push([en ? 'sum' : 'soma', total, GOLD]);
        const peak = Math.max(1, ...samples.map((s) => Math.abs(s.gasMomentum)), ...samples.map((s) => Math.abs(s.rocketMomentum)));
        const mid = H * 0.55;
        const span = H * 0.32;
        const barW = 92;
        const left = 70;
        const step = (W - 2 * left) / bars.length;
        ctx.strokeStyle = 'rgba(230, 236, 246, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(30, mid);
        ctx.lineTo(W - 30, mid);
        ctx.stroke();
        bars.forEach(([label, value, color], i) => {
          const x = left + i * step + (step - barW) / 2;
          const height = (value / peak) * span;
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.85;
          ctx.fillRect(x, Math.min(mid, mid - height), barW, Math.max(Math.abs(height), 2));
          ctx.globalAlpha = 1;
          ctx.font = '600 21px "DM Mono", ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = INK;
          ctx.fillText(label, x + barW / 2, H - 50);
          ctx.fillStyle = color;
          // t·km/s = 10⁶ kg·m/s.
          ctx.fillText(formatNumber(value / 1e6, 1, locale), x + barW / 2, H - 24);
        });
        ctx.textAlign = 'right';
        ctx.fillStyle = GREY;
        ctx.font = '500 20px "DM Mono", ui-monospace, monospace';
        ctx.fillText('t·km/s', W - 24, 34);
        screens[0]!.texture.needsUpdate = true;
      }

      // 2. Velocidade × tempo.
      {
        const ctx = screens[1]!.ctx;
        frame(ctx, en ? 'VELOCITY × TIME' : 'VELOCIDADE × TEMPO');
        const tMax = Math.max(last.t, 1);
        const vMax = Math.max(9, ...samples.map((s) => s.velocity / 1000), data.ideal(tMax) / 1000) * 1.05;
        const map = axes(ctx, tMax, vMax, 's', 'km/s', locale);
        if (data.target) {
          const [x0, y0] = map(0, ORBITAL_SPEED / 1000);
          const [x1] = map(tMax, 0);
          ctx.strokeStyle = GOLD;
          ctx.setLineDash([6, 6]);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y0);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = GOLD;
          ctx.textAlign = 'right';
          ctx.font = '600 20px "DM Mono", ui-monospace, monospace';
          ctx.fillText(en ? 'orbit 7.8 km/s' : 'órbita 7,8 km/s', x1, y0 - 14);
        }
        // Ideal (tracejada) e real.
        ctx.strokeStyle = 'rgba(127, 227, 255, 0.55)';
        ctx.setLineDash([10, 8]);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i = 0; i <= 120; i += 1) {
          const t = (tMax * i) / 120;
          const [x, y] = map(t, data.ideal(t) / 1000);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        const plot = (until: number, color: string, width: number): void => {
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.beginPath();
          let first = true;
          for (const s of samples) {
            if (s.t > until) break;
            const [x, y] = map(s.t, Math.max(s.velocity, 0) / 1000);
            if (first) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            first = false;
          }
          ctx.stroke();
        };
        plot(Number.POSITIVE_INFINITY, 'rgba(141, 255, 207, 0.25)', 3);
        plot(now.t, '#8dffcf', 4);
        ctx.textAlign = 'left';
        ctx.font = '500 19px "DM Mono", ui-monospace, monospace';
        ctx.fillStyle = 'rgba(127, 227, 255, 0.8)';
        ctx.fillText(en ? '--- Tsiolkovsky (no losses)' : '--- Tsiolkovsky (sem perdas)', 110, 92);
        screens[1]!.texture.needsUpdate = true;
      }

      // 3. Massa × tempo.
      {
        const ctx = screens[2]!.ctx;
        frame(ctx, en ? 'MASS × TIME' : 'MASSA × TEMPO');
        const tMax = Math.max(last.t, 1);
        const mMax = samples[0]!.mass / 1000;
        const map = axes(ctx, tMax, mMax * 1.05, 's', 't', locale);
        const plot = (until: number, color: string, width: number): void => {
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.beginPath();
          let first = true;
          for (const s of samples) {
            if (s.t > until) break;
            const [x, y] = map(s.t, s.mass / 1000);
            if (first) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            first = false;
          }
          ctx.stroke();
        };
        plot(Number.POSITIVE_INFINITY, 'rgba(255, 180, 92, 0.25)', 3);
        plot(now.t, ORANGE, 4);
        screens[2]!.texture.needsUpdate = true;
      }

      // 4. Δv × razão de massas.
      {
        const ctx = screens[3]!.ctx;
        frame(ctx, en ? 'Δv × MASS RATIO' : 'Δv × RAZÃO DE MASSAS');
        const rMax = Math.max(10, ...data.massRatios.map((r) => Math.ceil(r + 1)));
        const dvMax = (tsiolkovsky(data.exhaust, rMax, 1) / 1000) * 1.08;
        const map = axes(ctx, rMax, dvMax, 'm₀/m_f', 'Δv km/s', locale, 1);
        ctx.strokeStyle = CYAN;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        for (let i = 0; i <= 160; i += 1) {
          const r = 1 + ((rMax - 1) * i) / 160;
          const [x, y] = map(r, tsiolkovsky(data.exhaust, r, 1) / 1000);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        data.massRatios.forEach((ratio, i) => {
          const [x, y] = map(ratio, data.stageDeltaV[i]! / 1000);
          ctx.fillStyle = GOLD;
          ctx.beginPath();
          ctx.arc(x, y, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = '600 20px "DM Mono", ui-monospace, monospace';
          ctx.textAlign = 'left';
          ctx.fillText(`${i + 1}º`, x + 14, y - 12);
        });
        ctx.fillStyle = GREY;
        ctx.textAlign = 'left';
        ctx.font = '500 19px "DM Mono", ui-monospace, monospace';
        ctx.fillText(`vₑ = ${formatNumber(data.exhaust / 1000, 2, locale)} km/s`, 110, 92);
        screens[3]!.texture.needsUpdate = true;
      }
    },

    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const item of owned) item.dispose();
      group.clear();
    },
  };
}
