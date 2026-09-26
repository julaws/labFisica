export type Listener<T> = (state: Readonly<T>, previous: Readonly<T>) => void;
export type Unsubscribe = () => void;

export interface Store<T extends object> {
  get(): Readonly<T>;
  set(patch: Partial<T>): void;
  subscribe(listener: Listener<T>): Unsubscribe;
  /** Assina uma fatia derivada; só dispara quando o valor selecionado muda. */
  select<S>(selector: (state: Readonly<T>) => S, listener: (value: S) => void): Unsubscribe;
}

/**
 * Store mínima com assinaturas (SPEC §4). Uma única fonte de verdade para o
 * estado do experimento; a UI e a cena apenas assinam.
 */
export function createStore<T extends object>(initial: T): Store<T> {
  let state: T = { ...initial };
  const listeners = new Set<Listener<T>>();

  return {
    get(): Readonly<T> {
      return state;
    },
    set(patch: Partial<T>): void {
      let changed = false;
      for (const key of Object.keys(patch) as (keyof T)[]) {
        const value = patch[key];
        if (value !== undefined && !Object.is(state[key], value)) {
          changed = true;
          break;
        }
      }
      if (!changed) return;

      const previous = state;
      state = { ...state, ...patch };
      for (const listener of listeners) listener(state, previous);
    },
    subscribe(listener: Listener<T>): Unsubscribe {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    select<S>(selector: (state: Readonly<T>) => S, listener: (value: S) => void): Unsubscribe {
      let current = selector(state);
      return this.subscribe((next) => {
        const value = selector(next);
        if (!Object.is(value, current)) {
          current = value;
          listener(value);
        }
      });
    },
  };
}
