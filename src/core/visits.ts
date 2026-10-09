/**
 * Visitas a cada bancada: quantas vezes o seletor de experimentos (as abas e
 * as setas) levou alguém até ela.
 *
 * Mesmo serviço do contador da página (`src/ui/site-badge.ts`): o Abacus
 * (abacus.jasoncameron.dev), gratuito e aberto, sem conta nem chave. `hit`
 * soma um e devolve o total, `get` só lê. Uma chave por bancada.
 *
 * - Só o endereço publicado soma; o servidor de desenvolvimento e os testes
 *   apenas leem.
 * - Se o serviço falhar ou demorar, a leitura dá `null` (a placa mostra
 *   traços) e nada quebra.
 */

const COUNTER = 'https://abacus.jasoncameron.dev';
const NAMESPACE = 'julaws-laboptica';
const PUBLISHED_HOST = 'julaws.github.io';
const TIMEOUT_MS = 8000;

/** A chave de uma bancada no serviço. */
export const visitKey = (experimentId: string): string => `${NAMESPACE}/bench-${experimentId}`;

/** O endereço publicado soma visitas; os outros só leem. */
export const countsVisits = (hostname: string = window.location.hostname): boolean => hostname === PUBLISHED_HOST;

/** Lê o `value` de uma resposta do Abacus; `null` se não for um número. */
export function parseCount(body: unknown): number | null {
  const value = typeof body === 'object' && body !== null ? (body as { value?: unknown }).value : undefined;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

async function request(action: 'hit' | 'get', experimentId: string): Promise<number | null> {
  const abort = new AbortController();
  const timeout = window.setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${COUNTER}/${action}/${visitKey(experimentId)}`, { signal: abort.signal });
    // Chave ainda sem nenhuma visita: o serviço responde 404 ao `get`.
    if (response.status === 404) return 0;
    if (!response.ok) return null;
    return parseCount(await response.json());
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

export interface BenchVisits {
  /** Alguém clicou para ir a esta bancada: soma (no endereço publicado) e devolve o total. */
  record(experimentId: string): Promise<number | null>;
  /** Só lê o total (cacheado: a placa não pede de novo a cada volta à bancada). */
  read(experimentId: string): Promise<number | null>;
}

export function createBenchVisits(): BenchVisits {
  const cache = new Map<string, number>();
  const pending = new Map<string, Promise<number | null>>();
  // Os totais só crescem: guarda o maior já visto, para uma leitura que
  // chegue depois de uma soma não mostrar um número menor.
  const keep = (experimentId: string, value: number | null): number | null => {
    if (value !== null) cache.set(experimentId, Math.max(value, cache.get(experimentId) ?? 0));
    return cache.get(experimentId) ?? null;
  };
  return {
    record(experimentId: string): Promise<number | null> {
      const promise = request(countsVisits() ? 'hit' : 'get', experimentId).then((value) => keep(experimentId, value));
      pending.set(experimentId, promise);
      void promise.finally(() => {
        if (pending.get(experimentId) === promise) pending.delete(experimentId);
      });
      return promise;
    },
    async read(experimentId: string): Promise<number | null> {
      const inFlight = pending.get(experimentId);
      if (inFlight) return inFlight;
      const cached = cache.get(experimentId);
      if (cached !== undefined) return cached;
      return keep(experimentId, await request('get', experimentId));
    },
  };
}
