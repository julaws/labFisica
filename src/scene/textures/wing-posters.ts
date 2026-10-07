import type * as THREE from 'three';
import { artCanvas, caption, finishArt, paintFramedBackground } from './procedural';

/**
 * Cartazes retroiluminados da ala nova da sala, um atrás de cada bancada
 * nova: o buraco negro, uma figura de Chladni, os batimentos e o foguete.
 * Desenhados em canvas, como os cartazes e os quadros do resto da sala, e
 * postos lado a lado numa textura só (uma malha desenha os quatro).
 */

export const WING_POSTER_COUNT = 4;

const WIDTH = 768;
const HEIGHT = 1024;

type Painter = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function stars(ctx: CanvasRenderingContext2D, width: number, height: number, count: number, seed: number): void {
  const random = seeded(seed);
  for (let i = 0; i < count; i += 1) {
    const x = random() * width;
    const y = random() * height;
    const r = random() < 0.95 ? 0.6 + random() * 1.2 : 1.8 + random() * 1.6;
    const tint = random();
    ctx.fillStyle = tint < 0.2 ? '#ffd9b0' : tint < 0.4 ? '#c9dcff' : '#ffffff';
    ctx.globalAlpha = 0.35 + random() * 0.65;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Buraco negro com o disco de acreção visto quase de lado: a imagem do disco de trás sobe por cima da sombra. */
const blackHole: Painter = (ctx, width, height) => {
  paintFramedBackground(ctx, width, height, '#05060c', '#020306');
  stars(ctx, width, height * 0.86, 520, 20261007);
  const cx = width / 2;
  const cy = height * 0.45;
  const shadow = width * 0.17;

  ctx.globalCompositeOperation = 'lighter';
  // Imagem secundária do disco, curvada por cima e por baixo da sombra.
  for (const [sign, scale] of [
    [-1, 1],
    [1, 0.72],
  ] as const) {
    for (let k = 0; k < 26; k += 1) {
      const t = k / 25;
      const r = shadow * (1.12 + t * 0.55 * scale);
      ctx.strokeStyle = `rgba(255, ${Math.round(170 + 70 * (1 - t))}, ${Math.round(90 + 120 * (1 - t))}, ${0.16 * (1 - t) + 0.02})`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.98, 0, sign < 0 ? Math.PI : 0, sign < 0 ? Math.PI * 2 : Math.PI);
      ctx.stroke();
    }
  }
  // Disco da frente, achatado; o lado que vem na nossa direção (esquerda) brilha mais.
  for (let k = 0; k < 40; k += 1) {
    const t = k / 39;
    const r = shadow * (1.5 + t * 1.6);
    const gradient = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
    const alpha = 0.2 * (1 - t) + 0.02;
    gradient.addColorStop(0, `rgba(255, 245, 220, ${alpha * 1.6})`);
    gradient.addColorStop(0.5, `rgba(255, 170, 80, ${alpha})`);
    gradient.addColorStop(1, `rgba(200, 80, 30, ${alpha * 0.45})`);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.16, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  // Sombra e anel de fótons.
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(cx, cy, shadow, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 226, 180, 0.95)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, shadow * 1.02, 0, Math.PI * 2);
  ctx.stroke();
  // O pedaço do disco da frente que passa diante da sombra.
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 18; k += 1) {
    const t = k / 17;
    const r = shadow * (1.5 + t * 1.6);
    ctx.strokeStyle = `rgba(255, 190, 110, ${0.2 * (1 - t) + 0.03})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.16, 0, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  caption(ctx, width, height, 'Buraco negro · r = 2GM/c²');
};

/** Figura de Chladni da placa quadrada, modo (3, 5): a areia nas linhas nodais. */
const chladni: Painter = (ctx, width, height) => {
  paintFramedBackground(ctx, width, height, '#1a1d24', '#0d0f14');
  const size = Math.round(width * 0.74);
  const x0 = Math.round((width - size) / 2);
  const y0 = Math.round(height * 0.11);
  const plate = ctx.createLinearGradient(x0, y0, x0 + size, y0 + size);
  plate.addColorStop(0, '#5d636d');
  plate.addColorStop(0.5, '#3c4048');
  plate.addColorStop(1, '#2a2d33');
  ctx.fillStyle = plate;
  ctx.fillRect(x0, y0, size, size);
  const image = ctx.getImageData(x0, y0, size, size);
  const random = seeded(355);
  const n = 3;
  const m = 5;
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const x = i / size;
      const y = j / size;
      const u =
        Math.cos(n * Math.PI * x) * Math.cos(m * Math.PI * y) - Math.cos(m * Math.PI * x) * Math.cos(n * Math.PI * y);
      const sand = Math.exp(-((u / 0.07) ** 2));
      if (random() < sand * 0.85) {
        const k = (j * size + i) * 4;
        const shade = 200 + random() * 55;
        image.data[k] = shade;
        image.data[k + 1] = shade * 0.9;
        image.data[k + 2] = shade * 0.7;
      }
    }
  }
  ctx.putImageData(image, x0, y0);
  caption(ctx, width, height, 'Figuras de Chladni · modo (3, 5)');
};

/** Tela de osciloscópio: duas notas próximas somadas e a envoltória que pulsa. */
const beats: Painter = (ctx, width, height) => {
  paintFramedBackground(ctx, width, height, '#07140f', '#030806');
  const left = width * 0.1;
  const right = width * 0.9;
  const mid = height * 0.44;
  const amplitude = height * 0.17;
  ctx.strokeStyle = 'rgba(110, 255, 190, 0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i += 1) {
    const x = left + ((right - left) * i) / 10;
    ctx.beginPath();
    ctx.moveTo(x, mid - amplitude * 1.6);
    ctx.lineTo(x, mid + amplitude * 1.6);
    ctx.stroke();
  }
  for (let i = -4; i <= 4; i += 1) {
    const y = mid + (amplitude * 1.6 * i) / 4;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }
  const f1 = 21;
  const f2 = 23;
  const signal = (t: number): number => 0.5 * (Math.sin(2 * Math.PI * f1 * t) + Math.sin(2 * Math.PI * f2 * t));
  ctx.globalCompositeOperation = 'lighter';
  for (const [width2, alpha] of [
    [7, 0.12],
    [2.4, 0.9],
  ] as const) {
    ctx.strokeStyle = `rgba(120, 255, 200, ${alpha})`;
    ctx.lineWidth = width2;
    ctx.beginPath();
    for (let x = left; x <= right; x += 1) {
      const t = (x - left) / (right - left);
      const y = mid - amplitude * signal(t);
      if (x === left) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.setLineDash([10, 8]);
  ctx.strokeStyle = 'rgba(255, 196, 92, 0.85)';
  ctx.lineWidth = 2.4;
  for (const sign of [1, -1]) {
    ctx.beginPath();
    for (let x = left; x <= right; x += 2) {
      const t = (x - left) / (right - left);
      const y = mid - sign * amplitude * Math.abs(Math.cos(Math.PI * (f2 - f1) * t));
      if (x === left) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalCompositeOperation = 'source-over';
  caption(ctx, width, height, 'Batimentos · |f₁ − f₂|');
};

/** Foguete subindo sobre a borda da Terra, com a atmosfera azul ficando para trás. */
const rocket: Painter = (ctx, width, height) => {
  paintFramedBackground(ctx, width, height, '#02040b', '#06102a');
  stars(ctx, width, height * 0.6, 260, 7801);
  // Terra: um arco grande embaixo, com o brilho da atmosfera.
  const cx = width / 2;
  const cy = height * 1.55;
  const radius = height * 0.78;
  const glow = ctx.createRadialGradient(cx, cy, radius * 0.98, cx, cy, radius * 1.08);
  glow.addColorStop(0, 'rgba(110, 180, 255, 0.85)');
  glow.addColorStop(1, 'rgba(60, 120, 255, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.08, 0, Math.PI * 2);
  ctx.fill();
  const earth = ctx.createLinearGradient(0, cy - radius, 0, height);
  earth.addColorStop(0, '#2c6fb8');
  earth.addColorStop(0.3, '#1b4a86');
  earth.addColorStop(1, '#0b1c38');
  ctx.fillStyle = earth;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Foguete e chama.
  const rx = width * 0.5;
  const ry = height * 0.36;
  const body = width * 0.07;
  const flame = ctx.createLinearGradient(0, ry + body * 3.4, 0, ry + body * 8);
  flame.addColorStop(0, 'rgba(255, 250, 220, 0.95)');
  flame.addColorStop(0.35, 'rgba(255, 170, 60, 0.8)');
  flame.addColorStop(1, 'rgba(255, 80, 20, 0)');
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.moveTo(rx - body * 0.45, ry + body * 3.3);
  ctx.quadraticCurveTo(rx, ry + body * 9, rx + body * 0.45, ry + body * 3.3);
  ctx.fill();
  ctx.fillStyle = '#e9edf3';
  ctx.beginPath();
  ctx.moveTo(rx, ry - body * 2.2);
  ctx.quadraticCurveTo(rx + body * 0.62, ry - body * 1.2, rx + body * 0.5, ry);
  ctx.lineTo(rx + body * 0.5, ry + body * 3.3);
  ctx.lineTo(rx - body * 0.5, ry + body * 3.3);
  ctx.lineTo(rx - body * 0.5, ry);
  ctx.quadraticCurveTo(rx - body * 0.62, ry - body * 1.2, rx, ry - body * 2.2);
  ctx.fill();
  ctx.fillStyle = '#c8923a';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(rx + side * body * 0.5, ry + body * 2.0);
    ctx.lineTo(rx + side * body * 1.15, ry + body * 3.5);
    ctx.lineTo(rx + side * body * 0.5, ry + body * 3.3);
    ctx.fill();
  }
  ctx.fillStyle = '#7fe3ff';
  ctx.beginPath();
  ctx.arc(rx, ry - body * 0.6, body * 0.22, 0, Math.PI * 2);
  ctx.fill();
  caption(ctx, width, height, 'Foguete · Δv = vₑ ln(m₀/m_f)');
};

const PAINTERS: readonly Painter[] = [blackHole, chladni, beats, rocket];

/** Os quatro cartazes lado a lado: o i-ésimo ocupa u ∈ [i/4, (i+1)/4]. */
export function wingPosterAtlas(): THREE.Texture {
  const { canvas, ctx } = artCanvas(WIDTH * PAINTERS.length, HEIGHT);
  PAINTERS.forEach((paint, index) => {
    const { canvas: single, ctx: singleContext } = artCanvas(WIDTH, HEIGHT);
    paint(singleContext, WIDTH, HEIGHT);
    ctx.drawImage(single, index * WIDTH, 0);
  });
  return finishArt(canvas);
}
