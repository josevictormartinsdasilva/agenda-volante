import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import ajvFormats from 'ajv-formats';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { agendaRoutes } from '../../src/routes/agenda.js';
import { autenticacaoRoutes } from '../../src/routes/autenticacao.js';
import { contaRoutes } from '../../src/routes/conta.js';
import { criarGuarda } from '../../src/routes/autorizacao.js';
import { criarAmbiente, criarApp } from '../helpers.js';

type Json = unknown;
type Metodo = 'GET' | 'POST' | 'DELETE';
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
  /** Lista vazia: operação pública. Com itens: exige o token de sessão. */
  security?: object[];
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

/** Todas as operações do contrato, uma por (caminho, método). */
const operacoes = Object.entries(contrato.paths).flatMap(([caminho, metodos]) =>
  Object.entries(metodos).map(([metodo, operacao]) => ({
    caminho,
    metodo: metodo.toUpperCase() as Metodo,
    operacao,
  })),
);

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
  let teste: ReturnType<typeof criarApp>;

  beforeEach(() => {
    teste = criarApp();
    app = teste.app;
  });
  afterEach(() => app.close());

  it('o contrato tem as 17 operações da API', () => {
    // Sem isto, um contrato vazio faria os testes abaixo passarem sem conferir nada.
    expect(operacoes).toHaveLength(17);
  });

  it('toda operação documentada existe como rota da aplicação', async () => {
    await app.ready(); // as rotas entram por plugin e só existem depois do ready
    for (const { caminho, metodo } of operacoes) {
      const existe = app.hasRoute({ method: metodo, url: urlDoFastify(caminho) });
      expect(existe, `${metodo} ${caminho} não existe na aplicação`).toBe(true);
    }
  });

  it('toda rota da aplicação está documentada (fora as de saúde)', async () => {
    const registradas: string[] = [];
    const rotas = Fastify();
    rotas.addHook('onRoute', (rota) => {
      for (const metodo of [rota.method].flat()) {
        if (metodo !== 'HEAD') registradas.push(`${metodo} ${rota.url}`);
      }
    });
    const { casos, autenticacao } = criarAmbiente();
    const guarda = criarGuarda(autenticacao);
    await rotas.register(autenticacaoRoutes(autenticacao, guarda));
    await rotas.register(contaRoutes(autenticacao, guarda));
    await rotas.register(agendaRoutes(casos, guarda));
    await rotas.ready();

    const documentadas = operacoes.map(({ caminho, metodo }) => `${metodo} ${urlDoFastify(caminho)}`);
    expect(registradas.sort()).toEqual(documentadas.sort());
    await rotas.close();
  });

  it('a entrada que cada rota valida (corpo, parâmetros e query) é a do contrato', async () => {
    // Captura o schema com que cada rota foi registrada.
    const registradas = new Map<string, Record<string, Json>>();
    const rotas = Fastify();
    rotas.addHook('onRoute', (rota) => {
      registradas.set(`${String(rota.method)} ${rota.url}`, { ...rota.schema });
    });
    const { casos, autenticacao } = criarAmbiente();
    const guarda = criarGuarda(autenticacao);
    await rotas.register(autenticacaoRoutes(autenticacao, guarda));
    await rotas.register(contaRoutes(autenticacao, guarda));
    await rotas.register(agendaRoutes(casos, guarda));
    await rotas.ready();

    for (const { caminho, metodo, operacao } of operacoes) {
      const rota = `${metodo} ${urlDoFastify(caminho)}`;
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
    }
    await rotas.close();
  });

  it('exige login exatamente nas operações que o contrato marca com security', async () => {
    for (const { caminho, metodo, operacao } of operacoes) {
      const resposta = await app.inject({ method: metodo, url: caminho.replace(/\{\w+\}/g, 'x') });
      const protegida = (operacao.security ?? []).length > 0;

      expect(operacao.security, `${metodo} ${caminho} sem security declarado`).toBeDefined();
      expect(
        resposta.statusCode === 401,
        `${metodo} ${caminho}: contrato diz protegida=${protegida}, API respondeu ${resposta.statusCode}`,
      ).toBe(protegida);
    }
  });

  it('cada resposta do fluxo tem status documentado e corpo no formato do contrato', async () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    ajvFormats.default(ajv);

    const chamar = async (
      caminho: string,
      metodo: Metodo,
      url: string,
      opcoes: { headers?: { authorization: string }; payload?: object } = {},
    ) => ({ caminho, metodo, resposta: await app.inject({ method: metodo, url, ...opcoes }) });

    const ana = { nome: 'Ana', email: 'ana@exemplo.com', senha: 'senha-da-ana' };
    const cadastro = await chamar('/alunos', 'POST', '/alunos', { payload: ana });
    const repetido = await chamar('/alunos', 'POST', '/alunos', { payload: ana });
    const { id } = cadastro.resposta.json<{ id: string }>();
    const login = await chamar('/sessoes', 'POST', '/sessoes', {
      payload: { email: ana.email, senha: ana.senha },
    });
    const loginErrado = await chamar('/sessoes', 'POST', '/sessoes', {
      payload: { email: ana.email, senha: 'senha-errada' },
    });
    const aluno = { authorization: `Bearer ${login.resposta.json<{ token: string }>().token}` };
    const instrutor = await teste.comoInstrutor();
    const admin = await teste.comoAdmin();
    const novoInstrutor = { email: 'outro.instrutor@exemplo.com', senha: 'senha-do-outro' };
    const instrutorCriado = await chamar('/instrutores', 'POST', '/instrutores', {
      headers: admin,
      payload: novoInstrutor,
    });
    const instrutorRepetido = await chamar('/instrutores', 'POST', '/instrutores', {
      headers: admin,
      payload: novoInstrutor,
    });
    const instrutorPorAluno = await chamar('/instrutores', 'POST', '/instrutores', {
      headers: aluno,
      payload: novoInstrutor,
    });
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/sessoes',
        payload: { email: 'bloqueado@exemplo.com', senha: 'chute' },
      });
    }
    const loginBloqueado = await chamar('/sessoes', 'POST', '/sessoes', {
      payload: { email: 'bloqueado@exemplo.com', senha: 'chute' },
    });

    const reservar = (inicio: string) =>
      chamar('/aulas', 'POST', '/aulas', { headers: aluno, payload: { inicio } });

    const alunos = await chamar('/alunos', 'GET', '/alunos', { headers: instrutor });
    const pacote = await chamar('/alunos/{id}/pacote', 'POST', `/alunos/${id}/pacote`, {
      headers: instrutor,
      payload: { quantidade: 1 },
    });
    const publicar = await chamar('/disponibilidades', 'POST', '/disponibilidades', {
      headers: instrutor,
      payload: { inicios: [H10, H11] },
    });
    const livres = await chamar('/horarios-livres', 'GET', '/horarios-livres?data=2026-11-20', {
      headers: aluno,
    });
    const reserva = await reservar(H10);
    const ocupado = await reservar(H10);
    const semSaldo = await reservar(H11);
    const agenda = await chamar('/agenda', 'GET', '/agenda?data=2026-11-20', { headers: instrutor });
    const { aula } = reserva.resposta.json<{ aula: { id: string } }>();
    const cancelar = () =>
      chamar('/aulas/{id}/cancelar', 'POST', `/aulas/${aula.id}/cancelar`, { headers: aluno });

    const observadas = [
      cadastro,
      repetido,
      login,
      loginErrado,
      instrutorCriado,
      instrutorRepetido,
      instrutorPorAluno,
      loginBloqueado,
      alunos,
      pacote,
      publicar,
      livres,
      reserva,
      ocupado,
      semSaldo,
      agenda,
      await cancelar(),
      await cancelar(),
      await chamar('/aulas/{id}/cancelar', 'POST', '/aulas/fantasma/cancelar', { headers: aluno }),
      await chamar('/alunos/{id}/pacote', 'POST', '/alunos/fantasma/pacote', {
        headers: instrutor,
        payload: { quantidade: 1 },
      }),
      await chamar('/agenda', 'GET', '/agenda?data=amanha', { headers: instrutor }),
      await chamar('/agenda', 'GET', '/agenda?data=2026-11-20', { headers: aluno }),
      await chamar('/agenda', 'GET', '/agenda?data=2026-11-20'),
      await chamar('/alunos', 'POST', '/alunos', { payload: { nome: '' } }),
      await chamar('/minhas-aulas', 'GET', '/minhas-aulas', { headers: aluno }),
      await chamar('/minhas-aulas', 'GET', '/minhas-aulas', { headers: instrutor }),
      await chamar('/sessoes/atual', 'GET', '/sessoes/atual', { headers: aluno }),
      await chamar('/sessoes/atual', 'GET', '/sessoes/atual'),
      await chamar('/conta/senha', 'POST', '/conta/senha', {
        headers: aluno,
        payload: { senhaAtual: 'chute', novaSenha: 'senha-nova-da-ana' },
      }),
      await chamar('/alunos/{id}/codigo-de-redefinicao', 'POST', '/alunos/fantasma/codigo-de-redefinicao', {
        headers: instrutor,
      }),
      await chamar('/senha/redefinicao', 'POST', '/senha/redefinicao', {
        payload: { email: ana.email, codigo: 'AAAA-AAAA', novaSenha: 'senha-nova-da-ana' },
      }),
    ];
    const gerado = await chamar('/alunos/{id}/codigo-de-redefinicao', 'POST', `/alunos/${id}/codigo-de-redefinicao`, {
      headers: instrutor,
    });
    const { codigo } = gerado.resposta.json<{ codigo: string }>();
    observadas.push(
      gerado,
      await chamar('/senha/redefinicao', 'POST', '/senha/redefinicao', {
        payload: { email: ana.email, codigo, novaSenha: 'senha-nova-da-ana' },
      }),
    );
    const novoLogin = await app.inject({
      method: 'POST',
      url: '/sessoes',
      payload: { email: ana.email, senha: 'senha-nova-da-ana' },
    });
    const novaSessao = { authorization: `Bearer ${novoLogin.json<{ token: string }>().token}` };
    observadas.push(
      await chamar('/conta/senha', 'POST', '/conta/senha', {
        headers: novaSessao,
        payload: { senhaAtual: 'senha-nova-da-ana', novaSenha: 'mais-uma-senha' },
      }),
      await chamar('/conta', 'DELETE', '/conta', { headers: novaSessao, payload: { senha: 'chute' } }),
      await chamar('/conta', 'DELETE', '/conta', { headers: novaSessao, payload: { senha: 'mais-uma-senha' } }),
      await chamar('/sessoes/atual', 'DELETE', '/sessoes/atual', { headers: instrutor }),
    );

    // Sem isto o teste passaria mesmo que o fluxo falhasse: confirma cada caminho exercitado.
    expect(observadas.map((o) => o.resposta.statusCode)).toEqual([
      201, 409, 201, 401, 201, 409, 403, 429, 200, 200, 204, 200, 201, 409, 422, 200, 200, 409, 404, 404, 400, 403,
      401, 400, 200, 403, 200, 401, 403, 404, 400, 201, 204, 204, 403, 204, 204,
    ]);

    for (const { caminho, metodo, resposta } of observadas) {
      const onde = `${metodo} ${caminho} → ${resposta.statusCode}`;
      const documentada =
        contrato.paths[caminho]?.[metodo.toLowerCase()]?.responses[String(resposta.statusCode)];
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
