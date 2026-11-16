import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { criarAmbiente } from './helpers.js';

describe('GET /metrics', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp({ logLevel: 'silent' }, criarAmbiente().casos);
  });
  afterEach(() => app.close());

  async function metricas(): Promise<string> {
    const resposta = await app.inject({ method: 'GET', url: '/metrics' });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['content-type']).toContain('text/plain');
    return resposta.body;
  }

  it('conta a requisição com método, rota e status', async () => {
    await app.inject({ method: 'GET', url: '/health' });

    expect(await metricas()).toContain(
      'http_request_duration_seconds_count{method="GET",route="/health",status_code="200"} 1',
    );
  });

  it('agrupa pela rota declarada, não pela URL com o id', async () => {
    await app.inject({ method: 'POST', url: '/aulas/uma-aula/cancelar' });
    await app.inject({ method: 'POST', url: '/aulas/outra-aula/cancelar' });

    const corpo = await metricas();

    expect(corpo).toContain(
      'http_request_duration_seconds_count{method="POST",route="/aulas/:id/cancelar",status_code="404"} 2',
    );
    expect(corpo).not.toContain('uma-aula');
  });

  it('registra rota inexistente com um rótulo fixo, sem criar uma série por URL', async () => {
    await app.inject({ method: 'GET', url: '/nao-existe-1' });
    await app.inject({ method: 'GET', url: '/nao-existe-2' });

    const corpo = await metricas();

    expect(corpo).toContain(
      'http_request_duration_seconds_count{method="GET",route="nao_encontrada",status_code="404"} 2',
    );
    expect(corpo).not.toContain('nao-existe');
  });

  it('separa status 2xx de erro de validação 400 na mesma rota', async () => {
    await app.inject({ method: 'POST', url: '/alunos', payload: { nome: 'Ana' } });
    await app.inject({ method: 'POST', url: '/alunos', payload: { nome: '' } });

    const corpo = await metricas();

    expect(corpo).toContain(
      'http_request_duration_seconds_count{method="POST",route="/alunos",status_code="201"} 1',
    );
    expect(corpo).toContain(
      'http_request_duration_seconds_count{method="POST",route="/alunos",status_code="400"} 1',
    );
  });

  it('registra a duração em buckets, para calcular o p95', async () => {
    await app.inject({ method: 'GET', url: '/health' });

    const corpo = await metricas();

    expect(corpo).toMatch(
      /http_request_duration_seconds_bucket\{le="0\.3",method="GET",route="\/health",status_code="200"\} 1/,
    );
  });

  it('não mede a si mesmo', async () => {
    await metricas();

    expect(await metricas()).not.toContain('route="/metrics"');
  });

  it('cada aplicação tem o seu registro: contagens não vazam entre instâncias', async () => {
    await app.inject({ method: 'GET', url: '/health' });
    const outra = buildApp({ logLevel: 'silent' }, criarAmbiente().casos);

    const resposta = await outra.inject({ method: 'GET', url: '/metrics' });
    await outra.close();

    expect(resposta.body).not.toContain('route="/health"');
  });
});
