/**
 * Tunelamento por uma barreira retangular (ADR 0011).
 *
 * TypeScript puro, unidades SI internamente; a API recebe energias em eV e
 * larguras em metros, que é como o experimento fala.
 *
 * ## O problema
 *
 * Um elétron de energia E chega pela esquerda a uma barreira de altura V₀ e
 * largura a (de x = 0 a x = a). A equação de Schrödinger independente do
 * tempo, −(ħ²/2m)ψ″ + Vψ = Eψ, tem solução por trechos:
 *
 *     x < 0:      ψ = e^{ikx} + r·e^{−ikx}            k = √(2mE)/ħ
 *     0 < x < a:  ψ = C·e^{iKx} + D·e^{−iKx}          K = √(2m(E − V₀))/ħ
 *     x > a:      ψ = τ·e^{ik(x − a)}
 *
 * Com E < V₀, K = iκ, κ = √(2m(V₀ − E))/ħ: dentro da barreira a onda não
 * oscila, decai. ψ e ψ′ contínuos em x = 0 e x = a dão r, C, D e τ. A fração
 * que atravessa é T = |τ|² (mesmo k dos dois lados), e
 *
 *     T = [1 + V₀²·senh²(κa) / (4E(V₀ − E))]⁻¹,
 *
 * que para κa ≫ 1 vira T ≈ 16·E(V₀ − E)/V₀² · e^{−2κa}: o decaimento
 * exponencial com a largura que é o coração do tunelamento (e do microscópio
 * de varredura por tunelamento).
 */

import { ELECTRON_MASS, ELEMENTARY_CHARGE, PLANCK } from '../waves/double-slit';

export const HBAR = PLANCK / (2 * Math.PI);

/** Número complexo mínimo para a solução por trechos. */
export interface Complex {
  readonly re: number;
  readonly im: number;
}

const c = (re: number, im = 0): Complex => ({ re, im });
const add = (a: Complex, b: Complex): Complex => c(a.re + b.re, a.im + b.im);
const sub = (a: Complex, b: Complex): Complex => c(a.re - b.re, a.im - b.im);
const mul = (a: Complex, b: Complex): Complex => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a: Complex, b: Complex): Complex => {
  const d = b.re * b.re + b.im * b.im;
  return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
/** e^{i·z}, para z complexo. */
const expi = (z: Complex): Complex => {
  const scale = Math.exp(-z.im);
  return c(scale * Math.cos(z.re), scale * Math.sin(z.re));
};
export const abs2 = (z: Complex): number => z.re * z.re + z.im * z.im;

/** Número de onda de um elétron com energia cinética `energyEv`, 1/m. */
export function waveNumber(energyEv: number): number {
  return Math.sqrt(2 * ELECTRON_MASS * energyEv * ELEMENTARY_CHARGE) / HBAR;
}

/** Constante de decaimento κ dentro da barreira (E < V₀), 1/m. */
export function decayConstant(energyEv: number, heightEv: number): number {
  return Math.sqrt(2 * ELECTRON_MASS * Math.max(heightEv - energyEv, 0) * ELEMENTARY_CHARGE) / HBAR;
}

/** Coeficiente de transmissão exato de uma barreira retangular. */
export function transmission(energyEv: number, heightEv: number, width: number): number {
  if (width <= 0 || heightEv <= 0) return 1;
  const E = energyEv;
  const V = heightEv;
  if (Math.abs(E - V) < 1e-9) {
    const m = ELECTRON_MASS;
    const v = V * ELEMENTARY_CHARGE;
    return 1 / (1 + (m * width * width * v) / (2 * HBAR * HBAR));
  }
  if (E < V) {
    const s = Math.sinh(decayConstant(E, V) * width);
    return 1 / (1 + (V * V * s * s) / (4 * E * (V - E)));
  }
  const s = Math.sin(waveNumber(E - V) * width);
  return 1 / (1 + (V * V * s * s) / (4 * E * (E - V)));
}

/** Aproximação de barreira larga: T ≈ 16E(V₀ − E)/V₀² · e^{−2κa} (E < V₀). */
export function approximateTransmission(energyEv: number, heightEv: number, width: number): number {
  if (energyEv >= heightEv) return Number.NaN;
  const prefactor = (16 * energyEv * (heightEv - energyEv)) / (heightEv * heightEv);
  return prefactor * Math.exp(-2 * decayConstant(energyEv, heightEv) * width);
}

/** Corrente de tunelamento: a fração T do feixe incidente I₀. */
export function tunnelingCurrent(incident: number, energyEv: number, heightEv: number, width: number): number {
  return incident * transmission(energyEv, heightEv, width);
}

export interface BarrierWave {
  /** Número de onda fora da barreira, 1/m. */
  readonly k: number;
  /** Número de onda dentro dela: complexo (iκ) quando E < V₀. */
  readonly K: Complex;
  readonly r: Complex;
  readonly C: Complex;
  readonly D: Complex;
  readonly tau: Complex;
  readonly width: number;
  /** |τ|²: a fração que atravessa. */
  readonly transmission: number;
}

/**
 * Coeficientes da solução por trechos (ver o topo do arquivo), do casamento
 * de ψ e ψ′ em x = 0 e x = a. Em x = a: C·e^{iKa} + D·e^{−iKa} = τ e
 * K·(C·e^{iKa} − D·e^{−iKa}) = k·τ; daí C e D em função de τ, e em x = 0:
 * C·(1 + K/k) + D·(1 − K/k) = 2.
 */
export function barrierWave(energyEv: number, heightEv: number, width: number): BarrierWave {
  const k = waveNumber(energyEv);
  const inside = energyEv - heightEv;
  // K = √(2m(E − V₀))/ħ, imaginário puro abaixo da barreira.
  const magnitude = Math.sqrt(2 * ELECTRON_MASS * Math.abs(inside) * ELEMENTARY_CHARGE) / HBAR;
  const K = inside >= 0 ? c(Math.max(magnitude, 1e-6)) : c(0, magnitude);
  const kc = c(k);
  // C = τ·(K + k)/(2K)·e^{−iKa},  D = τ·(K − k)/(2K)·e^{iKa}
  const twoK = mul(c(2), K);
  const cFactor = mul(div(add(K, kc), twoK), expi(mul(K, c(-width))));
  const dFactor = mul(div(sub(K, kc), twoK), expi(mul(K, c(width))));
  const Kk = div(K, kc);
  const denominator = add(mul(cFactor, add(c(1), Kk)), mul(dFactor, sub(c(1), Kk)));
  const tau = div(c(2), denominator);
  const C = mul(tau, cFactor);
  const D = mul(tau, dFactor);
  const r = sub(add(C, D), c(1));
  return { k, K, r, C, D, tau, width, transmission: abs2(tau) };
}

/** ψ(x) da solução estacionária, com a barreira de x = 0 a x = a. */
export function waveAt(wave: BarrierWave, x: number): Complex {
  if (x < 0) return add(expi(c(wave.k * x)), mul(wave.r, expi(c(-wave.k * x))));
  if (x <= wave.width) {
    return add(mul(wave.C, expi(mul(wave.K, c(x)))), mul(wave.D, expi(mul(wave.K, c(-x)))));
  }
  return mul(wave.tau, expi(c(wave.k * (x - wave.width))));
}

/** Comprimento de onda de de Broglie, m. */
export function deBroglie(energyEv: number): number {
  return (2 * Math.PI) / waveNumber(energyEv);
}

/** Configuração padrão do experimento (ADR 0011). */
export const DEFAULT_TUNNELING = {
  /** Energia dos elétrons, eV. */
  energy: 1,
  /** Altura da barreira, eV. */
  height: 2,
  heightRange: { min: 0.5, max: 4 },
  /** Largura da barreira, m. */
  width: 0.4e-9,
  widthRange: { min: 0.1e-9, max: 1.2e-9 },
  /** Corrente do feixe incidente, A. */
  incident: 10e-9,
  incidentRange: { min: 1e-9, max: 100e-9 },
} as const;
