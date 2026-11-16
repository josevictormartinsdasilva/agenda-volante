import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import ajvFormats from 'ajv-formats';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { buildApp } from '../../src/app.js';
import { agendaRoutes } from '../../src/routes/agenda.js';
import { criarAmbiente } from '../helpers.js';

type Json = unknown;
interface Midia {
  content?: { 'application/json'?: { schema?: Json } };
}
interface Parametro {
  name: string;
  in: 'path' | 'query';
  required?: boolean;
  schema: Json;
}
interface Operacao {
  parameters?: Parametro[];
  requestBody?: Midia;
  responses: Record<string, Midia>;
}
type Caminhos = Record<string, Record<string, Operacao>>;

const bruto = parse(readFileSync('docs/openapi.yaml', 'utf8')) as Json;

/** Troca cada `$ref` local (`#/components/...`) pelo conteúdo apontado, recursivamente. */
function resolverRefs(no: Json): Json {
  if (Array.isArray(no)) return no.map(resolverRefs);
  if (no === null || typeof no !== 'object') return no;
  const objeto = no as Record<string, Json>;
  if (typeof objeto.$ref === 'string') {
    const alvo = objeto.$ref
      .replace(/^#\//, '')
      .split('/')
      .reduce<Json>((atual, chave) => (atual as Record<string, Json>)[chave], bruto);
    expect(alvo, `$ref sem destino: ${objeto.$ref}`).toBeDefined();
    return resolverRefs(alvo);
  }
  return Object.fromEntries(Object.entries(objeto).map(([k, v]) => [k, resolverRefs(v)]));
}

const contrato = resolverRefs(bruto) as { paths: Caminhos };

/** Tira o que só documenta (não valida), para comparar schema com schema. */
function semAnotacoes(no: Json): Json {
  if (Array.isArray(no)) return no.map(semAnotacoes);
  if (no === null || typeof no !== 'object') return no;
  return Object.fromEntries(
    Object.entries(no as Record<string, Json>)
      .filter(([chave]) => chave !== 'description' && chave !== 'example')
      .map(([chave, valor]) => [chave, semAnotacoes(valor)]),
  );
}

/** Os parâmetros de um lugar (path ou query) no formato de schema que o Fastify usa. */
function schemaDosParametros(operacao: Operacao, onde: Parametro['in']): Json | undefined {
  const parametros = (operacao.parameters ?? []).filter((p) => p.in === onde);
  if (parametros.length === 0) return undefined;
  return {
    type: 'object',
    required: parametros.filter((p) => p.required).map((p) => p.name),
    properties: Object.fromEntries(parametros.map((p) => [p.name, p.schema])),
  };
}

const H10 = '2026-11-20T13:00:00.000Z';
const H11 = '2026-11-20T14:00:00.000Z';

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

  it('a entrada que cada rota valida (corpo, parâmetros e query) é a do contrato', async () => {
    // Captura o schema com que cada rota foi registrada.
    const registradas = new Map<string, Record<string, Json>>();
    const rotas = Fastify();
    rotas.addHook('onRoute', (rota) => {
      registradas.set(`${String(rota.method)} ${rota.url}`, { ...rota.schema });
    });
    await rotas.register(agendaRoutes(criarAmbiente().casos));
    await rotas.ready();

    let comparadas = 0;
    for (const [caminho, metodos] of Object.entries(contrato.paths)) {
      for (const [metodo, operacao] of Object.entries(metodos)) {
        const rota = `${metodo.toUpperCase()} ${urlDoFastify(caminho)}`;
        const doContrato = {
          body: operacao.requestBody?.content?.['application/json']?.schema,
          params: schemaDosParametros(operacao, 'path'),
          querystring: schemaDosParametros(operacao, 'query'),
        };
        const daRota = registradas.get(rota) ?? {};

        expect(
          semAnotacoes({ body: daRota.body, params: daRota.params, querystring: daRota.querystring }),
          `a validação de ${rota} diverge do contrato`,
        ).toEqual(semAnotacoes(doContrato));
        comparadas++;
      }
    }
    expect(comparadas).toBe(7); // sem isto, um contrato vazio passaria
    await rotas.close();
  });

  it('cada resposta do fluxo tem status documentado e corpo no formato do contrato', async () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    ajvFormats.default(ajv);

    const chamar = async (caminho: string, metodo: 'get' | 'post', url: string, payload?: object) => ({
      caminho,
      metodo,
      resposta: await app.inject({ method: metodo.toUpperCase() as 'GET' | 'POST', url, payload }),
    });

    const aluno = await chamar('/alunos', 'post', '/alunos', { nome: 'Ana' });
    const { id } = aluno.resposta.json<{ id: string }>();
    const reservar = (inicio: string) =>
      chamar('/aulas', 'post', '/aulas', { alunoId: id, inicio });

    const pacote = await chamar('/alunos/{id}/pacote', 'post', `/alunos/${id}/pacote`, {
      quantidade: 1,
    });
    const publicar = await chamar('/disponibilidades', 'post', '/disponibilidades', {
      inicios: [H10, H11],
    });
    const livres = await chamar('/horarios-livres', 'get', '/horarios-livres?data=2026-11-20');
    const reserva = await reservar(H10);
    const ocupado = await reservar(H10);
    const semSaldo = await reservar(H11);
    const agenda = await chamar('/agenda', 'get', '/agenda?data=2026-11-20');
    const { aula } = reserva.resposta.json<{ aula: { id: string } }>();
    const cancelar = () =>
      chamar('/aulas/{id}/cancelar', 'post', `/aulas/${aula.id}/cancelar`);

    const observadas = [
      aluno,
      pacote,
      publicar,
      livres,
      reserva,
      ocupado,
      semSaldo,
      agenda,
      await cancelar(),
      await cancelar(),
      await chamar('/aulas/{id}/cancelar', 'post', '/aulas/fantasma/cancelar'),
      await chamar('/alunos/{id}/pacote', 'post', '/alunos/fantasma/pacote', { quantidade: 1 }),
      await chamar('/agenda', 'get', '/agenda?data=amanha'),
      await chamar('/alunos', 'post', '/alunos', { nome: '' }),
    ];

    // Sem isto o teste passaria mesmo que o fluxo falhasse: confirma cada caminho exercitado.
    expect(observadas.map((o) => o.resposta.statusCode)).toEqual([
      201, 200, 204, 200, 201, 409, 422, 200, 200, 409, 404, 404, 400, 400,
    ]);

    for (const { caminho, metodo, resposta } of observadas) {
      const onde = `${metodo.toUpperCase()} ${caminho} → ${resposta.statusCode}`;
      const documentada = contrato.paths[caminho]?.[metodo]?.responses[String(resposta.statusCode)];
      expect(documentada, `${onde} não está documentado`).toBeDefined();

      const schema = documentada?.content?.['application/json']?.schema;
      if (!schema) {
        expect(resposta.body, `${onde} não deveria ter corpo`).toBe('');
        continue;
      }
      const validar = ajv.compile(schema as object);
      const valido = validar(resposta.json());
      expect(valido, `${onde}: ${ajv.errorsText(validar.errors)}`).toBe(true);
    }
  });
});
