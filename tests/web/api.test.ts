import { describe, expect, it, vi } from 'vitest';
import { criarApi, ErroDaApi } from '../../web/js/api.js';

function respostaFalsa(status: number, corpo?: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => corpo,
  } as Response;
}

describe('cliente da API (interface)', () => {
  it('manda JSON com o cookie da sessão e devolve o corpo da resposta', async () => {
    const buscar = vi.fn(async () => respostaFalsa(201, { aula: { id: 'a1' } }));
    const api = criarApi(buscar);

    const corpo = await api.chamar('POST', '/aulas', { inicio: '2026-11-20T13:00:00.000Z' });

    expect(corpo).toEqual({ aula: { id: 'a1' } });
    expect(buscar).toHaveBeenCalledWith('/aulas', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inicio: '2026-11-20T13:00:00.000Z' }),
    });
  });

  it('sem corpo, não manda content-type (o Fastify recusaria JSON vazio)', async () => {
    const buscar = vi.fn(async () => respostaFalsa(200, { saldo: 1, aulas: [] }));

    await criarApi(buscar).chamar('POST', '/aulas/a1/cancelar');

    expect(buscar).toHaveBeenCalledWith('/aulas/a1/cancelar', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {},
      body: undefined,
    });
  });

  it('204 devolve undefined', async () => {
    const api = criarApi(async () => respostaFalsa(204));

    await expect(api.chamar('DELETE', '/sessoes/atual')).resolves.toBeUndefined();
  });

  it('erro da API vira ErroDaApi com o status e a mensagem em português', async () => {
    const api = criarApi(async () => respostaFalsa(422, { erro: 'Saldo de aulas insuficiente no pacote' }));

    const erro = await api.chamar('POST', '/aulas', {}).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroDaApi);
    expect(erro).toMatchObject({ status: 422, message: 'Saldo de aulas insuficiente no pacote' });
  });

  it('erro sem corpo JSON ainda dá uma mensagem', async () => {
    const api = criarApi(async () => ({ status: 502, ok: false, json: async () => { throw new Error(); } }) as unknown as Response);

    await expect(api.chamar('GET', '/minhas-aulas')).rejects.toMatchObject({
      status: 502,
      message: 'Algo deu errado (502). Tente de novo.',
    });
  });

  it('sem rede, avisa que não conseguiu falar com o servidor', async () => {
    const api = criarApi(async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(api.chamar('GET', '/minhas-aulas')).rejects.toMatchObject({
      status: 0,
      message: 'Sem conexão com o servidor. Confira a internet e tente de novo.',
    });
  });
});
