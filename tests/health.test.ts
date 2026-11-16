import Fastify from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { healthRoutes } from '../src/routes/health.js';
import { criarAmbiente, criarApp } from './helpers.js';

describe('GET /health (liveness)', () => {
  const { app } = criarApp();
  afterAll(() => app.close());

  it('responde 200 com status ok', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/health' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ status: 'ok' });
  });
});

describe('GET /ready (readiness)', () => {
  async function appCom(verificar: () => Promise<void>, limiteMs?: number) {
    const app = Fastify();
    await app.register(healthRoutes(verificar, limiteMs));
    return app;
  }

  it('responde 200 quando o armazenamento responde', async () => {
    const app = await appCom(async () => {});

    const resposta = await app.inject({ method: 'GET', url: '/ready' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ status: 'ok' });
  });

  it('responde 503 quando o armazenamento falha, e o /health segue 200', async () => {
    const app = await appCom(() => Promise.reject(new Error('banco fora')));

    const pronto = await app.inject({ method: 'GET', url: '/ready' });
    const vivo = await app.inject({ method: 'GET', url: '/health' });

    expect(pronto.statusCode).toBe(503);
    expect(pronto.json()).toEqual({ status: 'indisponivel' });
    expect(vivo.statusCode).toBe(200);
  });

  it('responde 503 quando o armazenamento não responde dentro do limite', async () => {
    const app = await appCom(() => new Promise<void>(() => {}), 20);

    const resposta = await app.inject({ method: 'GET', url: '/ready' });

    expect(resposta.statusCode).toBe(503);
  });

  it('a aplicação montada sem verificação (memória) está sempre pronta', async () => {
    const { app } = criarApp();

    const resposta = await app.inject({ method: 'GET', url: '/ready' });

    expect(resposta.statusCode).toBe(200);
    await app.close();
  });

  it('a aplicação usa a verificação que recebeu ao ser montada', async () => {
    const { casos, autenticacao } = criarAmbiente();
    const app = buildApp({ logLevel: 'silent' }, casos, autenticacao, {
      verificarArmazenamento: () => Promise.reject(new Error('banco fora')),
    });

    const resposta = await app.inject({ method: 'GET', url: '/ready' });

    expect(resposta.statusCode).toBe(503);
    await app.close();
  });
});
