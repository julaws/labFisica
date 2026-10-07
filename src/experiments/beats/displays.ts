import { type Waveform, envelope, harmonics, voiceValue } from '../../optics/acoustics/beats';
import type { Locale } from '../../core/experiment';
import { formatNumber } from '../../ui/i18n';

/**
 * As três telas dos batimentos (ADR 0019), desenhadas em canvas a cada quadro:
 *
 * - **Osciloscópio**: f₁ e f₂ em trilhas pequenas e a soma grande, com a
 *   envoltória ±√(A₁² + A₂² + 2A₁A₂cos 2πΔf t) tracejada (ondas senoidais).
 *   Cada coluna de pixels mostra o mínimo e o máximo do sinal naquele
 *   intervalo: com muitos ciclos por coluna vira a faixa que um osciloscópio
 *   de verdade mostra.
 * - **Espectro**: as linhas teóricas (harmônicos de Fourier de cada voz) e, por
 *   cima, o espectro medido ao vivo pelo AnalyserNode. Um quadro ampliado
 *   mostra as duas linhas da fundamental, separadas por Δf.
 * - **Fasores**: os dois vetores no referencial que gira com a frequência
 *   média, ponta com cauda, e a resultante pulsando.
 */

export interface SignalView {
  readonly f1: number;
  readonly f2: number;
  readonly a1: number;
  readonly a2: number;
  readonly waveform: Waveform;
  /** Instante atual (relógio do áudio ou da cena), s. */
  readonly t: number;
}

const GRID = 'rgba(110, 255, 190, 0.12)';
const CYAN = '#7fe3ff';
const ORANGE = '#ffb45c';
const GREEN = '#8dffcf';
const GOLD = '#ffd36b';

function background(ctx: CanvasRenderingContext2D, w: number, h: number, divisionsX: number, divisionsY: number): void {
  ctx.fillStyle = '#04100b';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= divisionsX; i += 1) {
    const x = (w * i) / divisionsX;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let j = 0; j <= divisionsY; j += 1) {
    const y = (h * j) / divisionsY;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

/** Janela do osciloscópio, s: dois batimentos inteiros, ou alguns ciclos das ondas. */
export function scopeWindow(view: SignalView, mode: 'beats' | 'waves'): number {
  const beat = Math.abs(view.f1 - view.f2);
  const mean = (view.f1 + view.f2) / 2;
  if (mode === 'waves' || beat >= 30) return 6 / mean;
  if (beat < 0.45) return 4.4;
  return Math.min(2.2 / beat, 4.4);
}

export function drawScope(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  view: SignalView,
  mode: 'beats' | 'waves',
  locale: Locale,
): void {
  background(ctx, w, h, 10, 8);
  const window = scopeWindow(view, mode);
  const t0 = view.t - window;
  const voices = [
    { frequency: view.f1, amplitude: view.a1, waveform: view.waveform },
    { frequency: view.f2, amplitude: view.a2, waveform: view.waveform },
  ];
  const tracks = [
    { value: (t: number) => voiceValue(voices[0]!, t), mid: h * 0.13, scale: h * 0.085, color: CYAN, width: 2.2 },
    { value: (t: number) => voiceValue(voices[1]!, t), mid: h * 0.33, scale: h * 0.085, color: ORANGE, width: 2.2 },
    {
      value: (t: number) => voiceValue(voices[0]!, t) + voiceValue(voices[1]!, t),
      mid: h * 0.69,
      scale: h * 0.135,
      color: GREEN,
      width: 3,
    },
  ];
  const samples = 6;
  ctx.globalCompositeOperation = 'lighter';
  for (const track of tracks) {
    ctx.strokeStyle = track.color;
    ctx.lineWidth = track.width;
    ctx.beginPath();
    for (let x = 0; x < w; x += 1) {
      let min = Infinity;
      let max = -Infinity;
      for (let k = 0; k <= samples; k += 1) {
        const value = track.value(t0 + ((x + k / samples) * window) / w);
        if (value < min) min = value;
        if (value > max) max = value;
      }
      const top = track.mid - max * track.scale;
      const bottom = track.mid - min * track.scale;
      if (x === 0) ctx.moveTo(x, top);
      ctx.lineTo(x, top);
      ctx.lineTo(x, bottom);
    }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';

  // Envoltória, para ondas senoidais e notas próximas.
  const beat = Math.abs(view.f1 - view.f2);
  if (view.waveform === 'sine' && beat < 30) {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2.6;
    ctx.setLineDash([12, 9]);
    for (const sign of [1, -1]) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const t = t0 + (x * window) / w;
        const y = tracks[2]!.mid - sign * envelope(view.a1, view.a2, view.f1, view.f2, t) * tracks[2]!.scale;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  const en = locale === 'en';
  ctx.font = '600 26px "DM Mono", ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = CYAN;
  ctx.fillText(`f₁ ${formatNumber(view.f1, 2, locale)} Hz`, 18, h * 0.04);
  ctx.fillStyle = ORANGE;
  ctx.fillText(`f₂ ${formatNumber(view.f2, 2, locale)} Hz`, 18, h * 0.24);
  ctx.fillStyle = GREEN;
  ctx.fillText(en ? 'sum' : 'soma', 18, h * 0.47);
  ctx.fillStyle = 'rgba(214, 255, 233, 0.75)';
  ctx.textAlign = 'right';
  const perDivision = window / 10;
  const division =
    perDivision >= 0.1
      ? `${formatNumber(perDivision, 2, locale)} s/div`
      : `${formatNumber(perDivision * 1000, perDivision >= 0.01 ? 1 : 2, locale)} ms/div`;
  ctx.fillText(division, w - 18, h * 0.96);
  ctx.textAlign = 'left';
}

export interface SpectrumView extends SignalView {
  /** Espectro medido em dB, faixa i em i·taxa/fftSize Hz; null sem som. */
  readonly measured: Float32Array | null;
  readonly sampleRate: number;
}

export function drawSpectrum(ctx: CanvasRenderingContext2D, w: number, h: number, view: SpectrumView, locale: Locale): void {
  background(ctx, w, h, 8, 6);
  const en = locale === 'en';
  const top = Math.max(view.f1, view.f2);
  const fmax = Math.min(4000, Math.max(600, top * 8.5));
  const base = h * 0.9;
  const dbToY = (db: number): number => base - ((Math.max(db, -60) + 60) / 60) * h * 0.78;
  const fx = (f: number): number => (f / fmax) * w;

  // Medido ao vivo: curva preenchida (o nível de −13 dBFS é o 0 dB teórico).
  if (view.measured) {
    const bins = view.measured.length;
    const binHz = view.sampleRate / (2 * bins);
    ctx.beginPath();
    ctx.moveTo(0, base);
    for (let x = 0; x < w; x += 1) {
      const from = Math.floor((x / w) * (fmax / binHz));
      const to = Math.max(from + 1, Math.floor(((x + 1) / w) * (fmax / binHz)));
      let peak = -200;
      for (let i = from; i < to && i < bins; i += 1) peak = Math.max(peak, view.measured[i]!);
      ctx.lineTo(x, dbToY(peak + 13));
    }
    ctx.lineTo(w, base);
    ctx.closePath();
    ctx.fillStyle = 'rgba(141, 255, 207, 0.22)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(141, 255, 207, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Linhas teóricas dos harmônicos.
  const voices: [number, number, string][] = [
    [view.f1, view.a1, CYAN],
    [view.f2, view.a2, ORANGE],
  ];
  voices.forEach(([f, a, color], index) => {
    if (a <= 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    for (const harmonic of harmonics(view.waveform, f, 40)) {
      if (harmonic.frequency > fmax) break;
      const x = fx(harmonic.frequency) + (index === 0 ? -2 : 2);
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.lineTo(x, dbToY(20 * Math.log10(harmonic.amplitude * a)));
      ctx.stroke();
    }
  });

  ctx.strokeStyle = 'rgba(214, 255, 233, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, base);
  ctx.lineTo(w, base);
  ctx.stroke();
  ctx.font = '500 22px "DM Mono", ui-monospace, monospace';
  ctx.fillStyle = 'rgba(214, 255, 233, 0.75)';
  ctx.textBaseline = 'top';
  for (let i = 0; i <= 4; i += 1) {
    const f = (fmax * i) / 4;
    ctx.textAlign = i === 0 ? 'left' : i === 4 ? 'right' : 'center';
    ctx.fillText(`${formatNumber(f, 0, locale)} Hz`, Math.min(Math.max(fx(f), 4), w - 4), base + 8);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '600 24px "DM Mono", ui-monospace, monospace';
  ctx.fillStyle = GREEN;
  ctx.fillText(view.measured ? (en ? 'live spectrum' : 'espectro ao vivo') : en ? 'theory (sound off)' : 'teoria (sem som)', 16, 22);

  // Lupa nas fundamentais: duas linhas a Δf uma da outra.
  const beat = Math.abs(view.f1 - view.f2);
  if (beat > 0 && beat < 30) {
    const bw = w * 0.36;
    const bh = h * 0.42;
    const bx = w - bw - 14;
    const by = 14;
    ctx.fillStyle = 'rgba(4, 16, 11, 0.92)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = 'rgba(255, 211, 107, 0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    const mean = (view.f1 + view.f2) / 2;
    const span = Math.max(beat * 2.2, 1.5);
    const zx = (f: number): number => bx + bw / 2 + ((f - mean) / span) * bw * 0.9;
    for (const [f, a, color] of voices) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(zx(f), by + bh - 34);
      ctx.lineTo(zx(f), by + bh - 34 - a * (bh - 70));
      ctx.stroke();
    }
    ctx.fillStyle = GOLD;
    ctx.font = '600 22px "DM Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Δf = ${formatNumber(beat, 2, locale)} Hz`, bx + bw / 2, by + bh - 16);
    ctx.textAlign = 'left';
  }
}

/** Câmera lenta dos fasores: acima de 1,5 batida por segundo, desacelera para 1,5. */
export function phasorSlowdown(beat: number): number {
  return beat > 1.5 ? beat / 1.5 : 1;
}

export function drawPhasors(ctx: CanvasRenderingContext2D, w: number, h: number, view: SignalView, locale: Locale): void {
  const en = locale === 'en';
  ctx.fillStyle = '#04100b';
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2 + 10;
  const unit = Math.min(w, h) * 0.26;
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1.5;
  for (const r of [1, 2]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * unit, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - 2.2 * unit, cy);
  ctx.lineTo(cx + 2.2 * unit, cy);
  ctx.moveTo(cx, cy - 2.2 * unit);
  ctx.lineTo(cx, cy + 2.2 * unit);
  ctx.stroke();

  const beat = Math.abs(view.f1 - view.f2);
  ctx.font = '600 24px "DM Mono", ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  if (beat >= 30) {
    ctx.fillStyle = 'rgba(214, 255, 233, 0.75)';
    ctx.fillText(en ? 'phasors: for close notes' : 'fasores: para notas próximas', cx, 28);
    return;
  }
  const slow = phasorSlowdown(beat);
  // Referencial girando com a frequência média: cada vetor gira a ±πΔf.
  const half = (Math.PI * (view.f1 - view.f2) * view.t) / slow;
  const v1 = { x: Math.cos(half) * view.a1, y: Math.sin(half) * view.a1 };
  const v2 = { x: Math.cos(-half) * view.a2, y: Math.sin(-half) * view.a2 };
  const arrow = (x0: number, y0: number, x1: number, y1: number, color: string, width: number): void => {
    const sx = cx + x0 * unit;
    const sy = cy - y0 * unit;
    const ex = cx + x1 * unit;
    const ey = cy - y1 * unit;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    const angle = Math.atan2(ey - sy, ex - sx);
    const head = 16 + width;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - head * Math.cos(angle - 0.4), ey - head * Math.sin(angle - 0.4));
    ctx.lineTo(ex - head * Math.cos(angle + 0.4), ey - head * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();
  };
  arrow(0, 0, v1.x, v1.y, CYAN, 5);
  arrow(v1.x, v1.y, v1.x + v2.x, v1.y + v2.y, ORANGE, 5);
  arrow(0, 0, v1.x + v2.x, v1.y + v2.y, GOLD, 7);
  ctx.fillStyle = 'rgba(214, 255, 233, 0.8)';
  ctx.fillText(
    slow > 1
      ? en
        ? `slow motion ÷${formatNumber(slow, 1, locale)}`
        : `câmera lenta ÷${formatNumber(slow, 1, locale)}`
      : en
        ? 'real speed'
        : 'velocidade real',
    cx,
    28,
  );
  ctx.textAlign = 'left';
}
