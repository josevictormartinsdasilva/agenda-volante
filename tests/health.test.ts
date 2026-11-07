import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { criarAmbiente } from './helpers.js';

describe('GET /health', () => {
  const app = buildApp({ logLevel: 'silent' }, criarAmbiente().casos);
  afterAll(() => app.close());

  it('responde 200 com status ok', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/health' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ status: 'ok' });
  });
});
