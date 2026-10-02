import * as THREE from 'three';

/**
 * Geradores de textura procedurais (SPEC §4 e §7).
 *
 * Tudo desenhado em canvas 2D e convertido em textura: nada de arquivo de
 * imagem externo, o que mantém o build pequeno e o primeiro quadro rápido
 * (SPEC §8). As texturas geradas aqui são cacheadas por chave, porque a mesma
 * superfície aparece em várias peças da bancada.
 */

const cache = new Map<string, THREE.Texture>();

function createCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para gerar texturas');
  return { canvas, ctx };
}

function finish(
  canvas: HTMLCanvasElement,
  { repeat = 1, colorSpace = THREE.NoColorSpace }: { repeat?: number; colorSpace?: THREE.ColorSpace } = {},
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = colorSpace;
  texture.anisotropy = 8;
  return texture;
}

function memo(key: string, create: () => THREE.Texture): THREE.Texture {
  const cached = cache.get(key);
  if (cached) return cached;
  const texture = create();
  cache.set(key, texture);
  return texture;
}

/** Ruído de valor com interpolação suave, determinístico. */
function valueNoise(width: number, height: number, cells: number, seed: number): Float32Array {
  const grid = new Float32Array((cells + 1) * (cells + 1));
  let state = seed >>> 0;
  const random = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  for (let i = 0; i < grid.length; i += 1) grid[i] = random();

  const out = new Float32Array(width * height);
  const smooth = (t: number): number => t * t * (3 - 2 * t);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const fx = (x / width) * cells;
      const fy = (y / height) * cells;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = smooth(fx - x0);
      const ty = smooth(fy - y0);

      const at = (gx: number, gy: number): number => grid[(gy % (cells + 1)) * (cells + 1) + (gx % (cells + 1))]!;
      const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
      const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
      out[y * width + x] = top * (1 - ty) + bottom * ty;
    }
  }

  return out;
}

/** Soma de oitavas de ruído de valor, normalizada em [0, 1]. */
function fbm(size: number, octaves: number, baseCells: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  let amplitude = 1;
  let total = 0;

  for (let o = 0; o < octaves; o += 1) {
    const layer = valueNoise(size, size, baseCells * 2 ** o, seed + o * 977);
    for (let i = 0; i < out.length; i += 1) out[i]! += layer[i]! * amplitude;
    total += amplitude;
    amplitude *= 0.5;
  }

  for (let i = 0; i < out.length; i += 1) out[i]! /= total;
  return out;
}

/** Converte um campo de altura em normal map tangente. */
function heightToNormal(height: Float32Array, size: number, strength: number): THREE.CanvasTexture {
  const { canvas, ctx } = createCanvas(size);
  const image = ctx.createImageData(size, size);

  const at = (x: number, y: number): number =>
    height[((y + size) % size) * size + ((x + size) % size)]!;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;

      const length = Math.hypot(dx, dy, 1);
      const index = (y * size + x) * 4;
      image.data[index] = ((-dx / length) * 0.5 + 0.5) * 255;
      image.data[index + 1] = ((-dy / length) * 0.5 + 0.5) * 255;
      image.data[index + 2] = (1 / length) * 255;
      image.data[index + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return finish(canvas);
}

/** Campo de altura em escala de cinza, como mapa de rugosidade ou AO. */
function heightToGray(height: Float32Array, size: number, low: number, high: number): THREE.CanvasTexture {
  const { canvas, ctx } = createCanvas(size);
  const image = ctx.createImageData(size, size);

  for (let i = 0; i < height.length; i += 1) {
    const value = (low + (high - low) * height[i]!) * 255;
    image.data[i * 4] = value;
    image.data[i * 4 + 1] = value;
    image.data[i * 4 + 2] = value;
    image.data[i * 4 + 3] = 255;
  }

  ctx.putImageData(image, 0, 0);
  return finish(canvas);
}

/** Concreto polido: rugosidade manchada e microrrelevo suave. */
export function concreteRoughness(size = 512): THREE.Texture {
  return memo('concrete-roughness', () => heightToGray(fbm(size, 4, 5, 11), size, 0.42, 0.62));
}

export function concreteNormal(size = 512): THREE.Texture {
  return memo('concrete-normal', () => heightToNormal(fbm(size, 5, 8, 11), size, 0.8));
}

/**
 * Latão escovado: riscos finos numa direção. O anisotrópico de verdade vem do
 * material (`anisotropy` do MeshPhysicalMaterial); a textura dá a variação.
 */
export function brushedMetalRoughness(size = 512): THREE.Texture {
  return memo('brushed-roughness', () => {
    const { canvas, ctx } = createCanvas(size);
    ctx.fillStyle = '#6a6a6a';
    ctx.fillRect(0, 0, size, size);

    let state = 20260927;
    const random = (): number => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0xffffffff;
    };

    for (let i = 0; i < size * 9; i += 1) {
      const y = random() * size;
      const alpha = 0.03 + random() * 0.1;
      const bright = random() > 0.5;
      ctx.strokeStyle = bright ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
      ctx.lineWidth = random() * 1.6 + 0.2;
      ctx.beginPath();
      ctx.moveTo(-10, y);
      ctx.lineTo(size + 10, y + (random() - 0.5) * 2);
      ctx.stroke();
    }

    return finish(canvas);
  });
}

/** Alumínio anodizado preto: microtextura fosca, quase uniforme. */
export function anodizedRoughness(size = 256): THREE.Texture {
  return memo('anodized-roughness', () => heightToGray(fbm(size, 3, 24, 77), size, 0.42, 0.58));
}

/**
 * Borracha serrilhada do anel de foco (SPEC §3.1): normal map de estrias
 * verticais com topo arredondado. `grooves` é a contagem ao redor do anel.
 */
export function knurledNormal(grooves = 96, size = 512): THREE.Texture {
  return memo(`knurled-${grooves}`, () => {
    const height = new Float32Array(size * size);

    for (let x = 0; x < size; x += 1) {
      // Onda triangular suavizada: crista arredondada, vale marcado.
      const phase = ((x / size) * grooves) % 1;
      const triangle = 1 - Math.abs(phase * 2 - 1);
      const value = Math.sin((triangle * Math.PI) / 2) ** 1.5;
      for (let y = 0; y < size; y += 1) height[y * size + x] = value;
    }

    // Quebra a regularidade com um ruído fraco, senão parece plástico.
    const grain = fbm(size, 2, 32, 5);
    for (let i = 0; i < height.length; i += 1) height[i] = height[i]! * 0.92 + grain[i]! * 0.08;

    return heightToNormal(height, size, 3.2);
  });
}

/** Madeira da bandeja do diorama: veios alongados. */
export function woodColor(size = 512): THREE.Texture {
  return memo('wood-color', () => {
    const { canvas, ctx } = createCanvas(size);
    const rings = fbm(size, 4, 3, 303);

    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = y * size + x;
        // Veios: anéis distorcidos ao longo de x, comprimidos em y.
        const distorted = (x / size) * 9 + rings[i]! * 2.2;
        const ring = Math.abs(Math.sin(distorted * Math.PI));
        const tone = 0.42 + ring * 0.34 + rings[i]! * 0.12;

        image.data[i * 4] = Math.min(255, tone * 168);
        image.data[i * 4 + 1] = Math.min(255, tone * 116);
        image.data[i * 4 + 2] = Math.min(255, tone * 72);
        image.data[i * 4 + 3] = 255;
      }
    }

    ctx.putImageData(image, 0, 0);
    return finish(canvas, { colorSpace: THREE.SRGBColorSpace });
  });
}

export interface RulerOptions {
  /** Comprimento representado pela textura, em mm. */
  lengthMm: number;
  /** Espaçamento das marcas menores, em mm. */
  minorStepMm?: number;
  /** A cada quantas marcas menores vem uma marca numerada. */
  majorEvery?: number;
  /** Largura da textura em pixels; a altura é 1/16 dela. */
  width?: number;
}

/**
 * Régua gravada do trilho óptico (SPEC §3.1), com marcações em mm e números.
 * Desenhada clara sobre transparente para entrar como mapa de emissão/alpha
 * por cima do alumínio anodizado.
 */
export function engravedRuler({
  lengthMm,
  minorStepMm = 10,
  majorEvery = 10,
  width = 2048,
}: RulerOptions): THREE.Texture {
  return memo(`ruler-${lengthMm}-${minorStepMm}-${majorEvery}-${width}`, () => {
    const height = Math.round(width / 32);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível para gerar a régua');

    ctx.clearRect(0, 0, width, height);

    const steps = Math.floor(lengthMm / minorStepMm);
    const pxPerStep = width / steps;

    ctx.strokeStyle = 'rgba(224, 236, 255, 0.95)';
    ctx.fillStyle = 'rgba(224, 236, 255, 0.88)';
    ctx.font = `500 ${Math.round(height * 0.34)}px 'DM Mono', ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let i = 0; i <= steps; i += 1) {
      const x = Math.round(i * pxPerStep) + 0.5;
      const isMajor = i % majorEvery === 0;

      ctx.lineWidth = isMajor ? 4.5 : 2.0;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, isMajor ? height * 0.46 : height * 0.26);
      ctx.stroke();

      if (isMajor) {
        const millimeters = i * minorStepMm;
        ctx.fillText(String(millimeters), x, height * 0.52);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 16;
    return texture;
  });
}

/**
 * Cartaz retroiluminado da parede (SPEC §3.1): o mesmo pinheiro fora de foco,
 * no limite e nítido, com raios desenhados. `blur` em pixels controla o estado.
 */
export function wallPosterTexture(blurPx: number, label: string, size = 512): THREE.Texture {
  return memo(`poster-${blurPx}-${label}`, () => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = Math.round(size * 1.4);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível para gerar o cartaz');

    const h = canvas.height;
    const background = ctx.createLinearGradient(0, 0, 0, h);
    background.addColorStop(0, '#0d1524');
    background.addColorStop(1, '#0a0f1b');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, h);

    // Raios de luz convergindo, desenhados atrás da árvore.
    ctx.strokeStyle = 'rgba(127, 227, 255, 0.22)';
    ctx.lineWidth = 1.5;
    for (let i = -4; i <= 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(size * 0.08, h * 0.5 + i * 16);
      ctx.lineTo(size * 0.92, h * 0.5 + i * 3);
      ctx.stroke();
    }

    ctx.save();
    ctx.filter = `blur(${blurPx}px)`;

    // Pinheiro estilizado.
    ctx.fillStyle = '#25543f';
    const cx = size * 0.5;
    const baseY = h * 0.72;
    for (let tier = 0; tier < 3; tier += 1) {
      const width = size * (0.34 - tier * 0.07);
      const top = baseY - h * (0.12 + tier * 0.11);
      ctx.beginPath();
      ctx.moveTo(cx, top);
      ctx.lineTo(cx - width / 2, baseY - h * tier * 0.09);
      ctx.lineTo(cx + width / 2, baseY - h * tier * 0.09);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#4a3423';
    ctx.fillRect(cx - size * 0.022, baseY, size * 0.044, h * 0.08);
    ctx.restore();

    // Moldura e legenda.
    ctx.strokeStyle = 'rgba(127, 227, 255, 0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, size - 12, h - 12);

    ctx.fillStyle = 'rgba(230, 234, 242, 0.85)';
    ctx.font = `600 ${Math.round(size * 0.062)}px Outfit, ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, size / 2, h * 0.9);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  });
}


export interface RingScaleMark {
  /** Posicao normalizada ao longo da circunferencia, 0 a 1. */
  readonly fraction: number;
  readonly label: string;
  readonly unit: 'm' | 'ft';
}

/**
 * Escala de distancia gravada no anel de foco (SPEC §6.4).
 *
 * As marcas chegam prontas de `focus-ring.ts`, calculadas pelo **mesmo** mapa
 * que o arraste usa. E por isso que a marca gravada coincide com o valor
 * mostrado no HUD, em vez de ser um desenho decorativo.
 *
 * `sweep` e a fracao da circunferencia ocupada pelo curso do anel.
 */
export function focusRingScale(
  marks: readonly RingScaleMark[],
  sweep: number,
  width = 2048,
): THREE.Texture {
  const key = `focus-scale-${width}-${sweep.toFixed(4)}-${marks.map((m) => m.label + m.unit).join(',')}`;

  return memo(key, () => {
    const height = Math.round(width / 8);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponivel para gerar a escala do anel');

    ctx.clearRect(0, 0, width, height);

    const metersY = height * 0.3;
    const feetY = height * 0.72;

    for (const mark of marks) {
      const x = Math.round(mark.fraction * sweep * width) + 0.5;
      const isMeters = mark.unit === 'm';
      const y = isMeters ? metersY : feetY;

      ctx.strokeStyle = isMeters ? 'rgba(232, 240, 255, 0.95)' : 'rgba(200, 146, 58, 0.95)';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 3;

      ctx.beginPath();
      ctx.moveTo(x, isMeters ? y + height * 0.1 : y - height * 0.1);
      ctx.lineTo(x, y);
      ctx.stroke();

      ctx.font = `500 ${Math.round(height * 0.2)}px 'DM Mono', ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = isMeters ? 'bottom' : 'top';
      ctx.fillText(mark.label, x, isMeters ? y - height * 0.02 : y + height * 0.04);
    }

    // Indice de leitura: a marca fixa do barril fica em fraction 0.
    ctx.strokeStyle = 'rgba(127, 227, 255, 0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(1.5, height * 0.44);
    ctx.lineTo(1.5, height * 0.56);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 16;
    return texture;
  });
}

/**
 * Céu pintado do fundo do diorama: degradê de azul, nuvens macias e uma serra
 * distante em tons frios. É o "pano de fundo" de maquete que fecha o vale e dá
 * à imagem no sensor um céu de verdade atrás do pico.
 */
export function skyBackdrop(width = 1024, height = 512): THREE.Texture {
  return memo(`sky-${width}x${height}`, () => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível para gerar o céu');

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#3f86d6');
    sky.addColorStop(0.55, '#8cc2ee');
    sky.addColorStop(1, '#d9ecf7');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    // Nuvens: aglomerados de discos brancos com borda suave, determinísticos.
    let state = 20260930;
    const random = (): number => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0xffffffff;
    };
    for (let cloud = 0; cloud < 7; cloud += 1) {
      const cx = random() * width;
      const cy = height * (0.12 + random() * 0.38);
      const puffs = 5 + Math.floor(random() * 5);
      for (let i = 0; i < puffs; i += 1) {
        const x = cx + (random() - 0.5) * width * 0.16;
        const y = cy + (random() - 0.5) * height * 0.06;
        const r = height * (0.04 + random() * 0.06);
        const puff = ctx.createRadialGradient(x, y, 0, x, y, r);
        puff.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        puff.addColorStop(0.6, 'rgba(255, 255, 255, 0.55)');
        puff.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = puff;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Serra ao longe, duas camadas: a de trás mais clara, pela névoa.
    const ridge = (base: number, amplitude: number, color: string, seed: number): void => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 8) {
        const t = x / width;
        const y =
          base -
          amplitude *
            (0.55 * Math.abs(Math.sin(t * 5.3 + seed)) +
              0.3 * Math.abs(Math.sin(t * 11.1 + seed * 2)) +
              0.15 * Math.sin(t * 23.7 + seed * 3));
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();
    };
    ridge(height * 0.86, height * 0.22, '#9fb6cf', 1.7);
    ridge(height * 0.95, height * 0.17, '#7d97b3', 4.1);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  });
}

/**
 * Quadro do átomo (parede direita): núcleo de prótons e nêutrons, três
 * órbitas elípticas em ângulos diferentes e os elétrons acesos, sobre azul
 * profundo, com moldura. Desenhado em canvas, como os cartazes.
 */
export function atomArtwork(width = 1024, height = 768): THREE.Texture {
  return memo(`atom-${width}x${height}`, () => {
    const { canvas, ctx } = artCanvas(width, height);
    paintFramedBackground(ctx, width, height, '#0b1a33', '#050b18');

    const cx = width / 2;
    const cy = height / 2;
    let state = 20261002;
    const random = (): number => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0xffffffff;
    };

    // Brilho difuso atrás do átomo.
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, height * 0.45);
    halo.addColorStop(0, 'rgba(127, 227, 255, 0.28)');
    halo.addColorStop(1, 'rgba(127, 227, 255, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);

    // Órbitas: três elipses giradas, com traço duplo (brilho + linha fina).
    const orbit = { rx: height * 0.4, ry: height * 0.13 };
    const angles = [0, Math.PI / 3, (2 * Math.PI) / 3];
    for (const angle of angles) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.strokeStyle = 'rgba(127, 227, 255, 0.25)';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.ellipse(0, 0, orbit.rx, orbit.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(200, 245, 255, 0.95)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }

    // Elétrons: um em cada órbita, aceso.
    angles.forEach((angle, index) => {
      const t = 0.7 + index * 2.1;
      const ex = Math.cos(t) * orbit.rx;
      const ey = Math.sin(t) * orbit.ry;
      const x = cx + ex * Math.cos(angle) - ey * Math.sin(angle);
      const y = cy + ex * Math.sin(angle) + ey * Math.cos(angle);
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 26);
      glow.addColorStop(0, 'rgba(255, 255, 255, 1)');
      glow.addColorStop(0.3, 'rgba(127, 227, 255, 0.9)');
      glow.addColorStop(1, 'rgba(127, 227, 255, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 26, 0, Math.PI * 2);
      ctx.fill();
    });

    // Núcleo: bolinhas vermelhas (prótons) e cinza-azuladas (nêutrons).
    const nucleus = height * 0.06;
    for (let i = 0; i < 14; i += 1) {
      const a = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * nucleus;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      const radius = nucleus * 0.42;
      const proton = i % 2 === 0;
      const ball = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, radius * 0.1, x, y, radius);
      ball.addColorStop(0, proton ? '#ffb4a0' : '#e6ecf5');
      ball.addColorStop(1, proton ? '#c2412f' : '#6c7a92');
      ctx.fillStyle = ball;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    caption(ctx, width, height, 'átomo');
    return finishArt(canvas);
  });
}

/**
 * Quadro da galáxia (parede esquerda): espiral de dois braços feita de
 * milhares de estrelas, núcleo amarelado, braços azulados e faixas de
 * poeira, sobre um céu estrelado, com moldura.
 */
export function galaxyArtwork(width = 1024, height = 768): THREE.Texture {
  return memo(`galaxy-${width}x${height}`, () => {
    const { canvas, ctx } = artCanvas(width, height);
    paintFramedBackground(ctx, width, height, '#070a1a', '#020309');

    let state = 19900424;
    const random = (): number => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0xffffffff;
    };
    const gaussian = (): number => (random() + random() + random() - 1.5) / 1.5;

    // Céu de fundo.
    for (let i = 0; i < 700; i += 1) {
      const a = random() * 0.8 + 0.1;
      ctx.fillStyle = `rgba(220, 230, 255, ${a * 0.7})`;
      ctx.fillRect(random() * width, random() * height, 1.4, 1.4);
    }

    const cx = width / 2;
    const cy = height / 2;
    const tilt = 0.55; // achatamento: a galáxia vista de viés
    const rotation = -0.35;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.globalCompositeOperation = 'lighter';

    // Halo difuso.
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, height * 0.42);
    halo.addColorStop(0, 'rgba(255, 220, 170, 0.5)');
    halo.addColorStop(0.35, 'rgba(150, 170, 255, 0.16)');
    halo.addColorStop(1, 'rgba(80, 100, 200, 0)');
    ctx.fillStyle = halo;
    ctx.save();
    ctx.scale(1, tilt);
    ctx.beginPath();
    ctx.arc(0, 0, height * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Braços: espiral logarítmica r = a·e^(bθ), com dispersão.
    const maxR = height * 0.44;
    for (let i = 0; i < 9000; i += 1) {
      const arm = i % 2;
      const theta = random() * 4.2;
      const r = maxR * 0.06 * Math.exp(0.68 * theta);
      if (r > maxR) continue;
      const spread = (0.06 + 0.12 * (r / maxR)) * maxR * gaussian();
      const angle = theta + arm * Math.PI;
      const x = Math.cos(angle) * r + Math.cos(angle + Math.PI / 2) * spread;
      const y = (Math.sin(angle) * r + Math.sin(angle + Math.PI / 2) * spread) * tilt;
      const near = 1 - r / maxR;
      const red = Math.round(150 + 105 * near);
      const green = Math.round(170 + 60 * near);
      const blue = Math.round(255 - 70 * near);
      ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${0.22 + 0.4 * random()})`;
      const size = random() < 0.04 ? 2.6 : 1.3;
      ctx.fillRect(x, y, size, size);
    }

    // Núcleo brilhante.
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, height * 0.09);
    core.addColorStop(0, 'rgba(255, 250, 230, 1)');
    core.addColorStop(0.4, 'rgba(255, 210, 150, 0.7)');
    core.addColorStop(1, 'rgba(255, 180, 120, 0)');
    ctx.fillStyle = core;
    ctx.save();
    ctx.scale(1, tilt * 1.2);
    ctx.beginPath();
    ctx.arc(0, 0, height * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();

    caption(ctx, width, height, 'galáxia');
    return finishArt(canvas);
  });
}

function artCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para o quadro');
  return { canvas, ctx };
}

/** Fundo em degradê com moldura escura e filete ciano, como os cartazes. */
function paintFramedBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  top: string,
  bottom: string,
): void {
  ctx.fillStyle = '#0a0d14';
  ctx.fillRect(0, 0, width, height);
  const inset = Math.round(height * 0.045);
  const background = ctx.createLinearGradient(0, inset, 0, height - inset);
  background.addColorStop(0, top);
  background.addColorStop(1, bottom);
  ctx.fillStyle = background;
  ctx.fillRect(inset, inset, width - inset * 2, height - inset * 2);
  ctx.strokeStyle = 'rgba(127, 227, 255, 0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(inset - 4, inset - 4, width - inset * 2 + 8, height - inset * 2 + 8);
}

function caption(ctx: CanvasRenderingContext2D, width: number, height: number, text: string): void {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(230, 236, 246, 0.8)';
  ctx.font = `600 ${Math.round(height * 0.04)}px Outfit, ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(text, width / 2, height * 0.92);
}

function finishArt(canvas: HTMLCanvasElement): THREE.Texture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Libera todas as texturas geradas. Chamado no dispose do laboratório. */
export function disposeProceduralTextures(): void {
  for (const texture of cache.values()) texture.dispose();
  cache.clear();
}

/**
 * Placa de identificação dourada (o "selo" da bancada, como o da referência):
 * latão com borda gravada, o nome grande e uma linha técnica embaixo. Desenhada
 * em canvas, com a tipografia da interface.
 */
export function nameplateTexture(title: string, subtitle: string, width = 1024, height = 352): THREE.Texture {
  return memo(`nameplate-${title}-${subtitle}-${width}`, () => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível para a placa');

    const rounded = (x: number, y: number, w: number, h: number, r: number): void => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };

    // Latão escovado: degradê diagonal e riscos finos horizontais.
    const brass = ctx.createLinearGradient(0, 0, width, height);
    brass.addColorStop(0, '#d8ad5e');
    brass.addColorStop(0.5, '#b98a45');
    brass.addColorStop(1, '#9a6d30');
    ctx.fillStyle = brass;
    rounded(0, 0, width, height, 36);
    ctx.fill();
    let state = 4242;
    const random = (): number => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0xffffffff;
    };
    for (let i = 0; i < 260; i += 1) {
      ctx.strokeStyle = `rgba(${random() < 0.5 ? '255,236,190' : '90,60,20'}, ${0.05 + random() * 0.08})`;
      ctx.lineWidth = 1;
      const y = random() * height;
      ctx.beginPath();
      ctx.moveTo(random() * width * 0.3, y);
      ctx.lineTo(width * (0.7 + random() * 0.3), y);
      ctx.stroke();
    }

    // Filete gravado por dentro da borda.
    ctx.strokeStyle = '#6d4c1e';
    ctx.lineWidth = 10;
    rounded(18, 18, width - 36, height - 36, 26);
    ctx.stroke();

    // Texto gravado: sombra clara embaixo, tinta escura por cima.
    const engrave = (text: string, font: string, y: number): void => {
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255, 236, 190, 0.55)';
      ctx.fillText(text, width / 2, y + 3);
      ctx.fillStyle = '#3a2710';
      ctx.fillText(text, width / 2, y);
    };
    engrave(title, `700 ${Math.round(height * 0.34)}px Outfit, ui-sans-serif, sans-serif`, height * 0.42);
    engrave(subtitle, `500 ${Math.round(height * 0.13)}px 'DM Mono', ui-monospace, monospace`, height * 0.76);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  });
}
