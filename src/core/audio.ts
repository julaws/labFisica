/**
 * Som dos experimentos (ADR 0016): um barramento Web Audio compartilhado, com
 * limitador e ganho máximo seguro, para que nenhum experimento passe de um
 * volume confortável — nem com dois osciladores somados em fase, nem com a
 * onda quadrada.
 *
 * - O `AudioContext` só nasce em `ensure()`, que o experimento chama dentro de
 *   um gesto da pessoa (o clique no botão de som): os navegadores bloqueiam
 *   som antes disso.
 * - Cadeia: entrada → limitador (DynamicsCompressor a −12 dBFS, razão 20:1,
 *   ataque de 3 ms) → teto de ganho → saída.
 * - `setActive` avisa o laboratório que um experimento está soando: a música
 *   de fundo se cala, como durante o vídeo explicativo, e volta quando ele
 *   para.
 * - `setDucked` silencia o barramento inteiro (o vídeo explicativo abriu).
 */

export interface LabAudio {
  /** Cria ou acorda o contexto. Chame dentro de um gesto. Null sem Web Audio. */
  ensure(): AudioContext | null;
  /** Contexto já criado, ou null. */
  readonly context: AudioContext | null;
  /** Entrada do barramento seguro (null antes de `ensure`). */
  readonly input: AudioNode | null;
  /** Marca o dono como soando ou em silêncio. */
  setActive(owner: string, active: boolean): void;
  /** Cala tudo (vídeo aberto) ou devolve o som. */
  setDucked(ducked: boolean): void;
}

export interface LabAudioOptions {
  /** Chamado quando algum experimento começa ou para de soar. */
  readonly onActiveChange?: (active: boolean) => void;
}

/** Teto do barramento: o limitador segura picos, o teto o nível geral. */
const CEILING = 0.5;

export function createLabAudio({ onActiveChange }: LabAudioOptions = {}): LabAudio {
  let context: AudioContext | null = null;
  let input: GainNode | null = null;
  let master: GainNode | null = null;
  let ducked = false;
  const owners = new Set<string>();

  const applyDuck = (): void => {
    if (!context || !master) return;
    master.gain.setTargetAtTime(ducked ? 0 : CEILING, context.currentTime, 0.05);
  };

  return {
    ensure(): AudioContext | null {
      if (!context) {
        const Context = window.AudioContext;
        if (!Context) return null;
        try {
          context = new Context();
        } catch {
          return null;
        }
        input = context.createGain();
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -12;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.12;
        master = context.createGain();
        master.gain.value = ducked ? 0 : CEILING;
        input.connect(limiter).connect(master).connect(context.destination);
      }
      if (context.state === 'suspended') void context.resume();
      return context;
    },
    get context(): AudioContext | null {
      return context;
    },
    get input(): AudioNode | null {
      return input;
    },
    setActive(owner: string, active: boolean): void {
      const before = owners.size > 0;
      if (active) owners.add(owner);
      else owners.delete(owner);
      const after = owners.size > 0;
      if (before !== after) onActiveChange?.(after);
    },
    setDucked(next: boolean): void {
      ducked = next;
      applyDuck();
    },
  };
}
