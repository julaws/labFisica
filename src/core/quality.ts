import type * as THREE from 'three';

/**
 * Qualidade adaptativa (SPEC §8).
 *
 * O nível inicial vem de uma heurística barata (GPU quando o navegador conta,
 * largura de tela, memória declarada). Depois disso, o tempo médio de quadro
 * manda: se o quadro passa do orçamento por tempo suficiente, cai um nível.
 * Subir de nível exige folga larga, para não ficar oscilando.
 */

export type QualityLevel = 'high' | 'medium' | 'low';

export interface QualitySettings {
  readonly level: QualityLevel;
  /** Teto do devicePixelRatio. */
  readonly maxPixelRatio: number;
  readonly shadows: boolean;
  readonly shadowMapSize: number;
  readonly ambientOcclusion: boolean;
  readonly bloom: boolean;
  readonly antialias: boolean;
  /** Resolução do render target da imagem no sensor (SPEC §6.6). */
  readonly sensorTargetSize: number;
  /** Quantidade de grama/vegetação instanciada no diorama (F4). */
  readonly instanceBudget: number;
  /**
   * Escala do render target de transmissão. O three re-renderiza a cena para
   * cada malha com `transmission`, então o vidro da objetiva é o item mais caro
   * da cena inteira. Meia resolução é imperceptível atrás do vidro.
   */
  readonly transmissionScale: number;
  /**
   * Profundidade de campo da câmera principal (SPEC §3.1): a sala ao fundo sai
   * desfocada e a bancada fica nítida. São passes de tela cheia a meia
   * resolução; no nível Baixo o fundo fica nítido.
   */
  readonly depthOfField: boolean;
  /**
   * Modo leve, escolhido pela pessoa no botão do canto inferior esquerdo:
   * além do nível Baixo, desliga sombras, bloom, AO e profundidade de campo,
   * a luz de área do teto e os detalhes de superfície dos materiais (normal
   * maps, rugosidade, verniz). O nível automático não sai dele sozinho.
   */
  readonly lightweight: boolean;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  high: {
    level: 'high',
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 2048,
    ambientOcclusion: true,
    bloom: true,
    antialias: true,
    sensorTargetSize: 1024,
    instanceBudget: 4000,
    transmissionScale: 0.5,
    depthOfField: true,
    lightweight: false,
  },
  medium: {
    level: 'medium',
    maxPixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    ambientOcclusion: true,
    bloom: true,
    antialias: true,
    sensorTargetSize: 768,
    instanceBudget: 2000,
    transmissionScale: 0.35,
    depthOfField: true,
    lightweight: false,
  },
  low: {
    level: 'low',
    maxPixelRatio: 1,
    shadows: true,
    shadowMapSize: 512,
    ambientOcclusion: false,
    bloom: true,
    antialias: false,
    sensorTargetSize: 512,
    instanceBudget: 700,
    transmissionScale: 0.2,
    depthOfField: false,
    lightweight: false,
  },
};

/** O modo leve: o nível Baixo sem os efeitos de luz, sombra e textura. */
export const LIGHTWEIGHT_SETTINGS: QualitySettings = {
  ...QUALITY_PRESETS.low,
  shadows: false,
  ambientOcclusion: false,
  bloom: false,
  depthOfField: false,
  transmissionScale: 0.15,
  lightweight: true,
};

const ORDER: QualityLevel[] = ['low', 'medium', 'high'];

/** Palpite inicial de nível, sem medir nada ainda. */
export function detectQualityLevel(renderer: THREE.WebGLRenderer): QualityLevel {
  const gl = renderer.getContext();
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = debugInfo
    ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)).toLowerCase()
    : '';

  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const isCoarse = window.matchMedia('(pointer: coarse)').matches;
  const width = window.innerWidth * window.devicePixelRatio;

  // Renderizadores de software não dão conta do nível alto de jeito nenhum.
  if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return 'low';

  if (isCoarse || deviceMemory <= 4 || width < 900) return 'low';
  if (/intel|uhd graphics|iris/.test(gpu) || deviceMemory <= 8) return 'medium';

  return 'high';
}

export interface QualityManager {
  readonly settings: QualitySettings;
  /** Alimenta o gerenciador com o tempo do último quadro, em ms. */
  sample(frameMs: number): void;
  /** Força um nível e avisa os assinantes. */
  set(level: QualityLevel): void;
  /**
   * Liga ou desliga o modo leve. Ligado, as configurações são as de
   * `LIGHTWEIGHT_SETTINGS` e o ajuste automático para; desligado, volta ao
   * nível em que estava.
   */
  setLightweight(on: boolean): void;
  readonly lightweight: boolean;
  onChange(listener: (settings: QualitySettings) => void): () => void;
}

export interface QualityOptions {
  /** Orçamento de tempo de quadro, em ms. 16,7 ms = 60 fps. */
  readonly budgetMs?: number;
  /** Quantos quadros ruins seguidos antes de cair um nível. */
  readonly patience?: number;
  /** Se false, o nível nunca muda sozinho (útil em testes e capturas). */
  readonly adaptive?: boolean;
}

export function createQualityManager(
  initial: QualityLevel,
  { budgetMs = 16.7, patience = 90, adaptive = true }: QualityOptions = {},
): QualityManager {
  let current = QUALITY_PRESETS[initial];
  let lightweight = false;
  const listeners = new Set<(settings: QualitySettings) => void>();
  const notify = (): void => {
    for (const listener of listeners) listener(lightweight ? LIGHTWEIGHT_SETTINGS : current);
  };

  let overBudget = 0;
  let underBudget = 0;

  const apply = (level: QualityLevel): void => {
    if (level === current.level) return;
    current = QUALITY_PRESETS[level];
    overBudget = 0;
    underBudget = 0;
    if (!lightweight) notify();
  };

  return {
    get settings(): QualitySettings {
      return lightweight ? LIGHTWEIGHT_SETTINGS : current;
    },
    get lightweight(): boolean {
      return lightweight;
    },
    setLightweight(on: boolean): void {
      if (on === lightweight) return;
      lightweight = on;
      overBudget = 0;
      underBudget = 0;
      notify();
    },
    sample(frameMs: number): void {
      if (!adaptive || lightweight) return;

      if (frameMs > budgetMs * 1.35) {
        overBudget += 1;
        underBudget = 0;
      } else if (frameMs < budgetMs * 0.6) {
        underBudget += 1;
        overBudget = 0;
      } else {
        overBudget = Math.max(0, overBudget - 1);
        underBudget = Math.max(0, underBudget - 1);
      }

      const index = ORDER.indexOf(current.level);

      if (overBudget >= patience && index > 0) {
        apply(ORDER[index - 1]!);
      } else if (underBudget >= patience * 4 && index < ORDER.length - 1) {
        apply(ORDER[index + 1]!);
      }
    },
    set(level: QualityLevel): void {
      apply(level);
    },
    onChange(listener: (settings: QualitySettings) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
