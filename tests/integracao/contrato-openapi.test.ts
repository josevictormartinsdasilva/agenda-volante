import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { criarAmbiente } from '../helpers.js';

interface Operacao {
  responses: Record<string, unknown>;
}
type Caminhos = Record<string, Record<string, Operacao>>;

const contrato = parse(readFileSync('docs/openapi.yaml', 'utf8')) as { paths: Caminhos };

const H10 = '2026-11-20T13:00:00.000Z';

/** O OpenAPI escreve /aulas/{id}/cancelar; o Fastify registra /aulas/:id/cancelar. */
const urlDoFastify = (caminho: string) => caminho.replace(/\{(\w+)\}/g, ':$1');

describe('aderência da API ao docs/openapi.yaml', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    const { casos } = criarAmbiente();
    app = buildApp({ logLevel: 'silent' }, casos);
  });
  afterEach(() => app.close());

  it('toda operação documentada existe como rota da aplicação', async () => {
    await app.ready(); // as rotas entram por plugin e só existem depois do ready
    for (const [caminho, metodos] of Object.entries(contrato.paths)) {
      for (const metodo of Object.keys(metodos)) {
        const existe = app.hasRoute({
          method: metodo.toUpperCase() as 'GET' | 'POST',
          url: urlDoFastify(caminho),
        });
        expect(existe, `${metodo.toUpperCase()} ${caminho} não existe na aplicação`).toBe(true);
      }
    }
  });

  it('os status que a API devolve no fluxo estão documentados', async () => {
    const aluno = await app.inject({ method: 'POST', url: '/alunos', payload: { nome: 'Ana' } });
    const { id } = aluno.json<{ id: string }>();

    const observados: Array<[string, string, number]> = [
      ['/alunos', 'post', aluno.statusCode],
      [
        '/alunos/{id}/pacote',
        'post',
        (await app.inject({ method: 'POST', url: `/alunos/${id}/pacote`, payload: { quantidade: 1 } }))
          .statusCode,
      ],
      [
        '/disponibilidades',
        'post',
        (await app.inject({ method: 'POST', url: '/disponibilidades', payload: { inicios: [H10] } }))
          .statusCode,
      ],
      [
        '/horarios-livres',
        'get',
        (await app.inject({ method: 'GET', url: '/horarios-livres?data=2026-11-20' })).statusCode,
      ],
      [
        '/aulas',
        'post',
        (await app.inject({ method: 'POST', url: '/aulas', payload: { alunoId: id, inicio: H10 } }))
          .statusCode,
      ],
      [
        '/aulas',
        'post',
        (await app.inject({ method: 'POST', url: '/aulas', payload: { alunoId: id, inicio: H10 } }))
          .statusCode,
      ],
      ['/agenda', 'get', (await app.inject({ method: 'GET', url: '/agenda?data=2026-11-20' })).statusCode],
      ['/agenda', 'get', (await app.inject({ method: 'GET', url: '/agenda?data=amanha' })).statusCode],
      [
        '/aulas/{id}/cancelar',
        'post',
        (await app.inject({ method: 'POST', url: '/aulas/fantasma/cancelar' })).statusCode,
      ],
    ];

    // Sem isto o teste passaria mesmo que a reserva falhasse: confirma o caminho feliz e o 409.
    expect(observados.filter(([c]) => c === '/aulas').map(([, , s]) => s)).toEqual([201, 409]);

    for (const [caminho, metodo, status] of observados) {
      const documentados = Object.keys(contrato.paths[caminho]?.[metodo]?.responses ?? {});
      expect(documentados, `${metodo.toUpperCase()} ${caminho} devolveu ${status}`).toContain(
        String(status),
      );
    }
  });
});
