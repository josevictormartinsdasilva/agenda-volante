import type { FastifyInstance } from 'fastify';
import { Registry } from 'prom-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, buildAppDeMetricas } from '../src/app.js';
import { criarAmbiente } from './helpers.js';

describe('métricas', () => {
  let app: FastifyInstance;
  let metricasApp: FastifyInstance;

  beforeEach(() => {
    const { casos, autenticacao } = criarAmbiente();
    const registro = new Registry();
    app = buildApp({ logLevel: 'silent' }, casos, autenticacao, { registroDeMetricas: registro });
    metricasApp = buildAppDeMetricas(registro);
  });
  afterEach(async () => {
    await app.close();
    await metricasApp.close();
  });

  async function metricas(): Promise<string> {
    const resposta = await metricasApp.inject({ method: 'GET', url: '/metrics' });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['content-type']).toContain('text/plain');
    return resposta.body;
  }

  it('não são expostas na porta pública da API', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/metrics' });

    expect(resposta.statusCode).toBe(404);
  });

  it('contam a requisição da API com método, rota e status', async () => {
    await app.inject({ method: 'GET', url: '/health' });

    expect(await metricas()).toContain(
      'http_request_duration_seconds_count{method="GET",route="/health",status_code="200"} 1',
    );
  });

  it('agrupam pela rota declarada, não pela URL com o id', async () => {
    await app.inject({ method: 'POST', url: '/aulas/uma-aula/cancelar' });
    await app.inject({ method: 'POST', url: '/aulas/outra-aula/cancelar' });

    const corpo = await metricas();

    expect(corpo).toContain(
      'http_request_duration_seconds_count{method="POST",route="/aulas/:id/cancelar",status_code="401"} 2',
    );
    expect(corpo).not.toContain('uma-aula');
  });

  it('registram rota inexistente com um rótulo fixo, sem criar uma série por URL', async () => {
    await app.inject({ method: 'GET', url: '/nao-existe-1' });
    await app.inject({ method: 'GET', url: '/nao-existe-2' });

    const corpo = await metricas();

    expect(corpo).toContain(
      'http_request_duration_seconds_count{method="GET",route="nao_encontrada",status_code="404"} 2',
    );
    expect(corpo).not.toContain('nao-existe');
  });

  it('separam status 2xx de erro de validação 400 na mesma rota', async () => {
    await app.inject({
      method: 'POST',
      url: '/alunos',
      payload: { nome: 'Ana', email: 'ana@exemplo.com', senha: 'senha-da-ana' },
    });
    await app.inject({ method: 'POST', url: '/alunos', payload: { nome: '' } });

    const corpo = await metricas();

    expect(corpo).toContain(
      'http_request_duration_seconds_count{method="POST",route="/alunos",status_code="201"} 1',
    );
    expect(corpo).toContain(
      'http_request_duration_seconds_count{method="POST",route="/alunos",status_code="400"} 1',
    );
  });

  it('registram a duração em buckets, para calcular o p95', async () => {
    await app.inject({ method: 'GET', url: '/health' });

    expect(await metricas()).toMatch(
      /http_request_duration_seconds_bucket\{le="0\.3",method="GET",route="\/health",status_code="200"\} 1/,
    );
  });

  it('a coleta não se mede', async () => {
    await metricas();

    expect(await metricas()).not.toContain('route="/metrics"');
  });

  it('a porta de métricas só tem o /metrics', async () => {
    for (const url of ['/health', '/alunos', '/agenda?data=2026-11-20']) {
      expect((await metricasApp.inject({ method: 'GET', url })).statusCode).toBe(404);
    }
  });

  it('cada aplicação tem o seu registro: contagens não vazam entre instâncias', async () => {
    await app.inject({ method: 'GET', url: '/health' });
    const registro = new Registry();
    const { casos, autenticacao } = criarAmbiente();
    const outra = buildApp({ logLevel: 'silent' }, casos, autenticacao, { registroDeMetricas: registro });

    const resposta = await buildAppDeMetricas(registro).inject({ method: 'GET', url: '/metrics' });
    await outra.close();

    expect(resposta.body).not.toContain('route="/health"');
  });
});
