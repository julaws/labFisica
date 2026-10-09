import { afterEach, describe, expect, it, vi } from 'vitest';
import { countsVisits, createBenchVisits, parseCount, visitKey } from '../../src/core/visits';

const respond = (status: number, body: unknown): Response =>
  ({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) }) as unknown as Response;

function stubBrowser(hostname: string, fetch: (url: string) => Promise<Response>): void {
  vi.stubGlobal('window', { location: { hostname }, setTimeout, clearTimeout });
  vi.stubGlobal('fetch', vi.fn(fetch));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('visitas às bancadas', () => {
  it('uma chave por bancada, no mesmo espaço do contador da página', () => {
    expect(visitKey('black-hole')).toBe('julaws-laboptica/bench-black-hole');
  });

  it('só o endereço publicado soma visitas', () => {
    expect(countsVisits('julaws.github.io')).toBe(true);
    expect(countsVisits('localhost')).toBe(false);
  });

  it('lê só números válidos', () => {
    expect(parseCount({ value: 42 })).toBe(42);
    expect(parseCount({ value: '42' })).toBeNull();
    expect(parseCount({ error: 'Key not found' })).toBeNull();
    expect(parseCount(null)).toBeNull();
  });

  it('no endereço publicado o clique soma (hit); fora dele só lê (get)', async () => {
    const urls: string[] = [];
    stubBrowser('julaws.github.io', (url) => {
      urls.push(url);
      return Promise.resolve(respond(200, { value: 7 }));
    });
    expect(await createBenchVisits().record('beats')).toBe(7);
    expect(urls[0]).toContain('/hit/julaws-laboptica/bench-beats');

    urls.length = 0;
    stubBrowser('localhost', (url) => {
      urls.push(url);
      return Promise.resolve(respond(200, { value: 7 }));
    });
    await createBenchVisits().record('beats');
    expect(urls[0]).toContain('/get/');
  });

  it('bancada sem visitas ainda (404) conta zero; serviço fora do ar dá null', async () => {
    stubBrowser('localhost', () => Promise.resolve(respond(404, { error: 'Key not found' })));
    expect(await createBenchVisits().read('rocket')).toBe(0);
    stubBrowser('localhost', () => Promise.reject(new Error('offline')));
    expect(await createBenchVisits().read('rocket')).toBeNull();
  });

  it('uma leitura atrasada não mostra menos que a soma já feita', async () => {
    let call = 0;
    stubBrowser('julaws.github.io', () => {
      call += 1;
      // A soma devolve 11; uma leitura velha devolveria 10.
      return Promise.resolve(respond(200, { value: call === 1 ? 11 : 10 }));
    });
    const visits = createBenchVisits();
    const recorded = visits.record('chladni');
    // A leitura feita durante a soma espera por ela.
    expect(await visits.read('chladni')).toBe(11);
    expect(await recorded).toBe(11);
    expect(await visits.read('chladni')).toBe(11);
  });
});
