import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { cabecalhoDoInstrutor, criarAmbiente, criarApp } from './helpers.js';

describe('tradução de erros para HTTP', () => {
  let app: FastifyInstance;
  afterEach(() => app.close());

  it('responde 400 (e não 500) quando o cliente manda JSON sem corpo', async () => {
    const teste = criarApp();
    app = teste.app;

    // Muitos clientes (Postman, wrappers de fetch) enviam este cabeçalho em todo POST,
    // inclusive em /aulas/:id/cancelar, que não tem corpo.
    const resposta = await app.inject({
      method: 'POST',
      url: '/aulas/qualquer-id/cancelar',
      headers: { 'content-type': 'application/json', ...(await teste.comoInstrutor()) },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json<{ erro: string }>().erro).toMatch(/body/i);
  });

  it('responde 400 quando o JSON enviado é malformado', async () => {
    app = criarApp().app;

    const resposta = await app.inject({
      method: 'POST',
      url: '/alunos',
      headers: { 'content-type': 'application/json' },
      payload: '{"nome": ',
    });

    expect(resposta.statusCode).toBe(400);
  });

  it('responde 500 genérico, sem vazar a mensagem, para erro inesperado', async () => {
    const ambiente = criarAmbiente();
    const { casos } = ambiente;
    const comFalha = {
      ...casos,
      cancelarAula: async () => {
        throw new Error('senha do banco: segredo');
      },
    };
    app = buildApp({ logLevel: 'silent' }, comFalha, ambiente.autenticacao);

    const resposta = await app.inject({
      method: 'POST',
      url: '/aulas/qualquer-id/cancelar',
      headers: await cabecalhoDoInstrutor(ambiente),
    });

    expect(resposta.statusCode).toBe(500);
    expect(resposta.json()).toEqual({ erro: 'Erro interno' });
  });
});
