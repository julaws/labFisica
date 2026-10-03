import * as THREE from 'three';

/**
 * Placas de equação (prata escovada, tinta preta), desenhadas em canvas.
 *
 * Um diagramador mínimo de fórmulas, sem dependência nova: texto, frações,
 * expoentes, índices e vetores com seta. Letras latinas e gregas minúsculas
 * saem em itálico, como manda a notação matemática (também há raiz
 * quadrada); números, operadores,
 * maiúsculas gregas e palavras marcadas com `up` saem retos.
 */

export type MathNode =
  | string
  | { readonly up: string }
  | { readonly frac: readonly [MathNode, MathNode] }
  | { readonly sup: readonly [MathNode, MathNode] }
  | { readonly sub: readonly [MathNode, MathNode] }
  | { readonly vec: MathNode }
  | { readonly sqrt: MathNode }
  | readonly MathNode[];

export interface EquationLine {
  readonly math: MathNode;
  /** Altura da fonte, em fração da altura da placa. */
  readonly size: number;
}

export interface EquationPlateSpec {
  /** Título gravado em cima, em versalete. */
  readonly title: string;
  /** Linhas de equação, de cima para baixo (ou lado a lado com `columns`). */
  readonly lines: readonly EquationLine[];
  /** Legenda pequena embaixo. */
  readonly caption?: string;
  /** Distribui as linhas em colunas, lado a lado (placas muito largas). */
  readonly columns?: boolean;
}

const MATH_FONT = '"Cambria Math", Cambria, "STIX Two Math", "Times New Roman", "Noto Serif", serif';
const INK = '#0b0d10';

interface Box {
  readonly width: number;
  readonly ascent: number;
  readonly descent: number;
  draw(ctx: CanvasRenderingContext2D, x: number, baseline: number): void;
}

const isItalic = (char: string): boolean => /[a-zA-Zα-ωħ]/u.test(char);

function textBox(ctx: CanvasRenderingContext2D, text: string, size: number, upright: boolean): Box {
  // Cada caractere com a sua fonte; espaços viram meio quadratim.
  const parts = [...text].map((char) => {
    const italic = !upright && isItalic(char);
    const font = `${italic ? 'italic ' : ''}${size}px ${MATH_FONT}`;
    ctx.font = font;
    // Itálico invade o vizinho da direita: um respiro proporcional ao corpo.
    const width = char === ' ' ? size * 0.28 : ctx.measureText(char).width + (italic ? size * 0.07 : 0);
    return { char, font, width };
  });
  return {
    width: parts.reduce((sum, part) => sum + part.width, 0),
    ascent: size * 0.74,
    descent: size * 0.24,
    draw(c, x, baseline): void {
      let cursor = x;
      for (const part of parts) {
        if (part.char !== ' ') {
          c.font = part.font;
          c.fillText(part.char, cursor, baseline);
        }
        cursor += part.width;
      }
    },
  };
}

function layout(ctx: CanvasRenderingContext2D, node: MathNode, size: number): Box {
  if (typeof node === 'string') return textBox(ctx, node, size, false);
  if (Array.isArray(node)) {
    const boxes = (node as readonly MathNode[]).map((child) => layout(ctx, child, size));
    return {
      width: boxes.reduce((sum, box) => sum + box.width, 0),
      ascent: Math.max(size * 0.74, ...boxes.map((box) => box.ascent)),
      descent: Math.max(size * 0.24, ...boxes.map((box) => box.descent)),
      draw(c, x, baseline): void {
        let cursor = x;
        for (const box of boxes) {
          box.draw(c, cursor, baseline);
          cursor += box.width;
        }
      },
    };
  }
  const n = node as Exclude<MathNode, string | readonly MathNode[]>;
  if ('up' in n) return textBox(ctx, n.up, size, true);

  if ('frac' in n) {
    const inner = size * 0.9;
    const top = layout(ctx, n.frac[0], inner);
    const bottom = layout(ctx, n.frac[1], inner);
    const pad = size * 0.12;
    const width = Math.max(top.width, bottom.width) + pad * 2;
    // Eixo matemático: a altura do traço do sinal de menos.
    const axis = size * 0.28;
    const gap = size * 0.14;
    const bar = Math.max(2, size * 0.055);
    return {
      width: width + size * 0.1,
      ascent: axis + gap + top.descent + top.ascent,
      descent: -axis + gap + bottom.ascent + bottom.descent,
      draw(c, x, baseline): void {
        const barY = baseline - axis;
        top.draw(c, x + size * 0.05 + (width - top.width) / 2, barY - gap - top.descent);
        bottom.draw(c, x + size * 0.05 + (width - bottom.width) / 2, barY + gap + bottom.ascent);
        c.fillRect(x + size * 0.05, barY - bar / 2, width, bar);
      },
    };
  }

  if ('sup' in n || 'sub' in n) {
    const sup = 'sup' in n;
    const [baseNode, scriptNode] = sup ? n.sup : n.sub;
    const base = layout(ctx, baseNode, size);
    const script = layout(ctx, scriptNode, size * 0.62);
    const shift = sup ? -size * 0.42 : size * 0.2;
    return {
      width: base.width + script.width + size * 0.04,
      ascent: Math.max(base.ascent, script.ascent - shift),
      descent: Math.max(base.descent, script.descent + shift),
      draw(c, x, baseline): void {
        base.draw(c, x, baseline);
        script.draw(c, x + base.width + size * 0.02, baseline + shift);
      },
    };
  }

  if ('sqrt' in n) {
    const radicand = layout(ctx, n.sqrt, size);
    const sign = size * 0.62;
    const gap = size * 0.12;
    const line = Math.max(2, size * 0.055);
    return {
      width: sign + radicand.width + size * 0.12,
      ascent: radicand.ascent + gap + line,
      descent: radicand.descent + size * 0.04,
      draw(c, x, baseline): void {
        const top = baseline - radicand.ascent - gap;
        const bottom = baseline + radicand.descent;
        c.save();
        c.lineWidth = line;
        c.lineJoin = 'round';
        c.strokeStyle = c.fillStyle;
        c.beginPath();
        // Tique, descida até embaixo, subida longa e o traço por cima.
        c.moveTo(x + size * 0.04, baseline - size * 0.28);
        c.lineTo(x + size * 0.16, baseline - size * 0.36);
        c.lineTo(x + sign * 0.48, bottom);
        c.lineTo(x + sign * 0.92, top);
        c.lineTo(x + sign + radicand.width + size * 0.08, top);
        c.stroke();
        c.restore();
        radicand.draw(c, x + sign, baseline);
      },
    };
  }

  // Vetor: seta por cima.
  const body = layout(ctx, n.vec, size);
  const lift = size * 0.16;
  const arrow = size * 0.12;
  return {
    width: body.width,
    ascent: body.ascent + lift + arrow,
    descent: body.descent,
    draw(c, x, baseline): void {
      body.draw(c, x, baseline);
      const y = baseline - body.ascent - lift;
      const x0 = x + size * 0.12;
      const x1 = x + body.width + size * 0.02;
      const line = Math.max(2, size * 0.05);
      c.fillRect(x0, y - line / 2, x1 - x0 - arrow * 0.6, line);
      c.beginPath();
      c.moveTo(x1, y);
      c.lineTo(x1 - arrow, y - arrow * 0.55);
      c.lineTo(x1 - arrow, y + arrow * 0.55);
      c.closePath();
      c.fill();
    },
  };
}

const textureCache = new Map<string, THREE.Texture>();

/**
 * Textura de uma placa de equações: prata escovada, filete gravado e tinta
 * preta. `width`/`height` em pixels, na proporção da placa.
 */
export function equationPlateTexture(spec: EquationPlateSpec, width: number, height: number): THREE.Texture {
  const key = `${JSON.stringify(spec)}-${width}x${height}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para a placa de equações');

  const radius = Math.min(width, height) * 0.06;
  const rounded = (x: number, y: number, w: number, h: number, r: number): void => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  // Prata escovada: degradê suave e riscos horizontais finos.
  const silver = ctx.createLinearGradient(0, 0, width * 0.4, height);
  silver.addColorStop(0, '#e9edf1');
  silver.addColorStop(0.45, '#c6ccd3');
  silver.addColorStop(1, '#a9b0b9');
  ctx.fillStyle = silver;
  rounded(0, 0, width, height, radius);
  ctx.fill();
  let state = 9137;
  const random = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  for (let i = 0; i < Math.round(height * 1.4); i += 1) {
    ctx.strokeStyle = `rgba(${random() < 0.5 ? '255,255,255' : '60,66,74'}, ${0.04 + random() * 0.07})`;
    ctx.lineWidth = 1 + random();
    const y = random() * height;
    ctx.beginPath();
    ctx.moveTo(random() * width * 0.4, y);
    ctx.lineTo(width * (0.6 + random() * 0.4), y);
    ctx.stroke();
  }
  const inset = Math.min(width, height) * 0.035;
  ctx.strokeStyle = 'rgba(40, 46, 54, 0.85)';
  ctx.lineWidth = Math.max(4, Math.min(width, height) * 0.012);
  rounded(inset, inset, width - inset * 2, height - inset * 2, radius * 0.7);
  ctx.stroke();

  // Texto gravado: realce claro embaixo, tinta preta por cima.
  const engrave = (draw: () => void, offset: number): void => {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.translate(0, offset);
    draw();
    ctx.restore();
    ctx.fillStyle = INK;
    draw();
  };

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const measureTitle = (size: number): number => {
    ctx.font = `700 ${size}px Outfit, ui-sans-serif, sans-serif`;
    return [...spec.title].reduce((sum, char) => sum + ctx.measureText(char).width + size * 0.18, 0);
  };
  // O título cabe na largura útil, mesmo numa placa estreita.
  let titleSize = Math.round(height * (spec.columns ? 0.13 : 0.085));
  const titleRoom = width * (spec.columns ? 0.3 : 0.86);
  if (measureTitle(titleSize) > titleRoom) titleSize = Math.floor((titleSize * titleRoom) / measureTitle(titleSize));
  const titleFont = `700 ${titleSize}px Outfit, ui-sans-serif, sans-serif`;
  const titleSpacing = titleSize * 0.18;
  const titleWidth = measureTitle(titleSize);
  const drawTitle = (x: number, y: number): void => {
    ctx.font = titleFont;
    let cursor = x;
    for (const char of spec.title) {
      ctx.fillText(char, cursor, y);
      cursor += ctx.measureText(char).width + titleSpacing;
    }
  };

  const layoutAll = (factor: number): Box[] =>
    spec.lines.map((line) => layout(ctx, line.math, Math.round(height * line.size * factor)));
  let boxes = layoutAll(1);
  const shadow = Math.max(2, height * 0.006);

  if (spec.columns) {
    // Título à esquerda, equações lado a lado.
    const titleX = inset * 2.2;
    engrave(() => drawTitle(titleX, height / 2 + titleSize * 0.35), shadow);
    const start = titleX + titleWidth + width * 0.04;
    const free = width - start - inset * 2;
    const total = boxes.reduce((sum, box) => sum + box.width, 0);
    const gap = (free - total) / boxes.length;
    let cursor = start + gap / 2;
    for (const box of boxes) {
      const baseline = height / 2 + (box.ascent - box.descent) / 2;
      const x = cursor;
      engrave(() => box.draw(ctx, x, baseline), shadow);
      cursor += box.width + gap;
    }
  } else {
    const titleY = inset * 2 + titleSize;
    engrave(() => drawTitle((width - titleWidth) / 2, titleY), shadow);
    const captionSize = Math.round(height * 0.055);
    const top = titleY + titleSize * 0.6;
    const bottom = height - inset * 2 - (spec.caption ? captionSize * 1.6 : 0);
    // Encolhe as linhas até caberem na altura e na largura, com folga.
    const fit = (list: Box[]): number =>
      Math.min(
        ((bottom - top) * 0.9) / list.reduce((sum, box) => sum + box.ascent + box.descent, 0),
        ((width - inset * 6) * 1) / Math.max(...list.map((box) => box.width)),
      );
    const factor = fit(boxes);
    if (factor < 1) boxes = layoutAll(factor * 0.98);
    const heights = boxes.map((box) => box.ascent + box.descent);
    const gap = (bottom - top - heights.reduce((a, b) => a + b, 0)) / (boxes.length + 1);
    let y = top + gap;
    for (const box of boxes) {
      const baseline = y + box.ascent;
      const x = (width - box.width) / 2;
      engrave(() => box.draw(ctx, x, baseline), shadow);
      y += box.ascent + box.descent + gap;
    }
    if (spec.caption) {
      const caption = spec.caption;
      engrave(() => {
        ctx.font = `500 ${captionSize}px 'DM Mono', ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(caption, width / 2, height - inset * 2.2);
        ctx.textAlign = 'left';
      }, shadow * 0.6);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  textureCache.set(key, texture);
  return texture;
}

/** Libera as texturas de equação (fim da página). */
export function disposeEquationTextures(): void {
  for (const texture of textureCache.values()) texture.dispose();
  textureCache.clear();
}
