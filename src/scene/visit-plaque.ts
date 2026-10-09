import * as THREE from 'three';
import { HardwareKit, groupGeometries, pose, screenBezel } from './hardware';
import type { MaterialLibrary } from './materials';

/**
 * Placa de visitas na frente de cada bancada (canto inferior direito, abaixo
 * da placa da equação): um contador mecânico, com rótulo, um olho e seis
 * tambores de dígitos brancos sobre preto, numa moldura anodizada. O número
 * vem de `src/core/visits.ts`; sem número (serviço fora do ar), os tambores
 * mostram traços.
 *
 * Duas malhas: a face (textura de canvas, com os parafusos pintados) e a
 * moldura do kit. Não projeta sombra.
 */

export interface VisitPlaque {
  readonly group: THREE.Group;
  setValue(value: number | null): void;
  setLabel(label: string): void;
  dispose(): void;
}

const W = 1024;
const H = 400;
/** Tamanho da face, em unidades de cena. */
export const PLAQUE_SIZE = { width: 0.38, height: 0.38 * (H / W) } as const;
const DIGITS = 6;

export function createVisitPlaque(materials: MaterialLibrary, label: string): VisitPlaque {
  const group = new THREE.Group();
  group.name = 'visit-plaque';

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para a placa de visitas');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const material = new THREE.MeshStandardMaterial({ map: texture, metalness: 0.35, roughness: 0.5, envMapIntensity: 0.6 });
  const faceGeometry = new THREE.PlaneGeometry(PLAQUE_SIZE.width, PLAQUE_SIZE.height);
  const face = new THREE.Mesh(faceGeometry, material);
  face.position.z = 0.001;
  group.add(face);

  const kit = new HardwareKit();
  screenBezel(kit, pose(0, 0, -0.004), { width: PLAQUE_SIZE.width, height: PLAQUE_SIZE.height, border: 0.008, depth: 0.006, radius: 0.007 });
  const frame = kit.build(materials, 'visit-plaque-frame', { castShadow: false });
  group.add(frame);
  const geometries = [faceGeometry, ...groupGeometries(frame)];

  let value: number | null = null;
  let text = label;

  const draw = (): void => {
    // Fundo de metal escovado escuro.
    const plate = ctx.createLinearGradient(0, 0, 0, H);
    plate.addColorStop(0, '#2a303b');
    plate.addColorStop(1, '#161a22');
    ctx.fillStyle = plate;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#ffffff';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    ctx.globalAlpha = 1;

    // Parafusos pintados nos cantos.
    for (const [x, y] of [
      [34, 34],
      [W - 34, 34],
      [34, H - 34],
      [W - 34, H - 34],
    ] as const) {
      const screw = ctx.createRadialGradient(x - 4, y - 4, 1, x, y, 14);
      screw.addColorStop(0, '#e8c27a');
      screw.addColorStop(1, '#7a4f16');
      ctx.fillStyle = screw;
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40, 24, 6, 0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 8, y + 8);
      ctx.lineTo(x + 8, y - 8);
      ctx.stroke();
    }

    // Rótulo com o olho.
    ctx.fillStyle = '#d9b26a';
    ctx.font = '700 46px Outfit, ui-sans-serif, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const labelY = 92;
    const eyeX = 96;
    ctx.save();
    ctx.translate(eyeX, labelY);
    ctx.beginPath();
    ctx.moveTo(-30, 0);
    ctx.quadraticCurveTo(0, -26, 30, 0);
    ctx.quadraticCurveTo(0, 26, -30, 0);
    ctx.closePath();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#d9b26a';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillText(text, eyeX + 52, labelY + 2);

    // Tambores do contador.
    const cellW = 118;
    const cellH = 176;
    const gap = 16;
    const total = DIGITS * cellW + (DIGITS - 1) * gap;
    const x0 = (W - total) / 2;
    const y0 = 160;
    ctx.fillStyle = '#05070b';
    ctx.beginPath();
    ctx.roundRect(x0 - 18, y0 - 16, total + 36, cellH + 32, 18);
    ctx.fill();
    const digits = value === null ? '–'.repeat(DIGITS) : String(Math.min(value, 10 ** DIGITS - 1)).padStart(DIGITS, '0');
    const leading = value === null ? 0 : DIGITS - String(Math.max(value, 0)).length;
    for (let i = 0; i < DIGITS; i += 1) {
      const x = x0 + i * (cellW + gap);
      // Tambor: mais claro no meio, sombra em cima e embaixo (curvatura).
      const drum = ctx.createLinearGradient(0, y0, 0, y0 + cellH);
      drum.addColorStop(0, '#0b0d12');
      drum.addColorStop(0.22, '#20242d');
      drum.addColorStop(0.5, '#2b303a');
      drum.addColorStop(0.78, '#20242d');
      drum.addColorStop(1, '#0b0d12');
      ctx.fillStyle = drum;
      ctx.beginPath();
      ctx.roundRect(x, y0, cellW, cellH, 10);
      ctx.fill();
      ctx.fillStyle = i < leading ? 'rgba(238, 242, 250, 0.32)' : '#eef2fa';
      ctx.font = '600 128px "DM Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(digits[i]!, x + cellW / 2, y0 + cellH / 2 + 6);
      // Linha do eixo dos tambores.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(x, y0 + cellH / 2 - 1, cellW, 2);
    }
    texture.needsUpdate = true;
  };
  draw();
  // Os dígitos usam a DM Mono: redesenha quando a fonte carregar.
  void document.fonts?.ready.then(draw);

  return {
    group,
    setValue(next: number | null): void {
      if (next === value) return;
      value = next;
      draw();
    },
    setLabel(next: string): void {
      if (next === text) return;
      text = next;
      draw();
    },
    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      material.dispose();
      texture.dispose();
      group.removeFromParent();
    },
  };
}
