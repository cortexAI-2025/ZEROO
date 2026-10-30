import { callFunction, FunctionError } from '../functions';
import { errorKey } from '../errors';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest
        .fn()
        .mockResolvedValue({ data: { session: { access_token: 'jeton-test' } } }),
    },
  },
}));
jest.mock('@/lib/env', () => ({
  env: { functionsUrl: 'http://fonctions.test', supabaseAnonKey: 'anon-test' },
}));

const reply = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe('callFunction', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renvoie le corps JSON et envoie la session de l’utilisateur', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(reply(200, { orderId: 'o1' }));
    await expect(callFunction('create-order', { a: 1 })).resolves.toEqual({ orderId: 'o1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://fonctions.test/create-order');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer jeton-test');
    expect(init?.signal).toBeInstanceOf(AbortSignal); // délai maximal
  });

  it('transmet le code métier d’une erreur serveur', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(reply(400, { error: 'price_changed' }));
    const error = await callFunction('create-order', {}).catch((e) => e);
    expect(error).toBeInstanceOf(FunctionError);
    expect(error).toMatchObject({ message: 'price_changed', status: 400 });
    expect(errorKey(error)).toBe('errors.priceChanged');
  });

  it('erreur serveur sans corps : internal_error', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('html');
      },
    } as unknown as Response);
    await expect(callFunction('billing', {})).rejects.toMatchObject({
      message: 'internal_error',
      status: 502,
    });
  });

  it('délai dépassé pendant la lecture du corps : erreur réseau, jamais une réponse vide en succès', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new DOMException('timeout', 'TimeoutError');
      },
    } as unknown as Response);
    await expect(callFunction('create-order', {})).rejects.toMatchObject({
      message: 'network_error',
      status: 0,
    });
  });

  it('hors ligne ou délai dépassé : erreur réseau dédiée, jamais une erreur générique', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await callFunction('create-order', {}).catch((e) => e);
    expect(error).toMatchObject({ message: 'network_error', status: 0 });
    expect(errorKey(error)).toBe('common.networkError');
  });
});
