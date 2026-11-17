import type { FastifyInstance } from 'fastify';
import type { Autenticacao } from '../application/autenticacao.js';
import {
  apagarCookieDeSessao,
  COOKIE_PADRAO,
  gravarCookieDeSessao,
  type Guarda,
  identidadeDe,
  type OpcoesDoCookie,
  tokenDaRequisicao,
} from './autorizacao.js';

export function autenticacaoRoutes(
  autenticacao: Autenticacao,
  guarda: Guarda,
  cookie: OpcoesDoCookie = COOKIE_PADRAO,
) {
  return async (app: FastifyInstance): Promise<void> => {
    // Pública: o próprio aluno cria a conta. Ele só reserva depois que o instrutor
    // registrar um pacote, então uma conta avulsa não ocupa a agenda.
    app.post<{ Body: { nome: string; email: string; senha: string } }>(
      '/alunos',
      {
        schema: {
          body: {
            type: 'object',
            required: ['nome', 'email', 'senha'],
            properties: {
              nome: { type: 'string', minLength: 1, maxLength: 120 },
              email: { type: 'string', format: 'email', maxLength: 254 },
              senha: { type: 'string', minLength: 8, maxLength: 128 },
            },
          },
        },
      },
      async (req, res) => res.status(201).send(await autenticacao.cadastrarAluno(req.body)),
    );

    // Só o administrador cria instrutor. O administrador nasce do comando `criar-admin`.
    app.post<{ Body: { email: string; senha: string } }>(
      '/instrutores',
      {
        onRequest: guarda('admin'),
        schema: {
          body: {
            type: 'object',
            required: ['email', 'senha'],
            properties: {
              email: { type: 'string', format: 'email', maxLength: 254 },
              senha: { type: 'string', minLength: 8, maxLength: 128 },
            },
          },
        },
      },
      async (req, res) => res.status(201).send(await autenticacao.cadastrarInstrutor(req.body)),
    );

    // Login: a política de senha (mínimo de 8) vale no cadastro, não aqui.
    app.post<{ Body: { email: string; senha: string } }>(
      '/sessoes',
      {
        schema: {
          body: {
            type: 'object',
            required: ['email', 'senha'],
            properties: {
              email: { type: 'string', minLength: 1, maxLength: 254 },
              senha: { type: 'string', minLength: 1, maxLength: 128 },
            },
          },
        },
      },
      // `req.ip` é o IP do cliente; atrás de proxy, só com TRUST_PROXY=true (ADR 0004).
      async (req, res) => {
        const sessao = await autenticacao.entrar({ ...req.body, origem: req.ip });
        // O token vai no corpo (para clientes de API) e no cookie (para o navegador).
        gravarCookieDeSessao(res, sessao.token, cookie);
        return res.status(201).send(sessao);
      },
    );

    // Quem está logado: a interface usa para escolher as telas (aluno ou instrutor).
    app.get('/sessoes/atual', { onRequest: guarda('admin', 'instrutor', 'aluno') }, async (req) => {
      const { papel, alunoId } = identidadeDe(req);
      return { papel, alunoId };
    });

    // Logout da sessão do token enviado.
    app.delete(
      '/sessoes/atual',
      { onRequest: guarda('admin', 'instrutor', 'aluno') },
      async (req, res) => {
        await autenticacao.sair(tokenDaRequisicao(req));
        apagarCookieDeSessao(res, cookie);
        return res.status(204).send();
      },
    );
  };
}
