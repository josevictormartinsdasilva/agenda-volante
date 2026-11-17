import type { FastifyInstance } from 'fastify';
import type { Autenticacao } from '../application/autenticacao.js';
import {
  apagarCookieDeSessao,
  COOKIE_PADRAO,
  type Guarda,
  identidadeDe,
  type OpcoesDoCookie,
  tokenDaRequisicao,
} from './autorizacao.js';

const novaSenha = { type: 'string', minLength: 8, maxLength: 128 } as const;

/** A própria conta: trocar senha, redefinir com código e excluir (ADR 0005). */
export function contaRoutes(
  autenticacao: Autenticacao,
  guarda: Guarda,
  cookie: OpcoesDoCookie = COOKIE_PADRAO,
) {
  return async (app: FastifyInstance): Promise<void> => {
    // Qualquer conta troca a própria senha, confirmando a atual.
    app.post<{ Body: { senhaAtual: string; novaSenha: string } }>(
      '/conta/senha',
      {
        onRequest: guarda('admin', 'instrutor', 'aluno'),
        schema: {
          body: {
            type: 'object',
            required: ['senhaAtual', 'novaSenha'],
            properties: {
              senhaAtual: { type: 'string', minLength: 1, maxLength: 128 },
              novaSenha,
            },
          },
        },
      },
      async (req, res) => {
        await autenticacao.trocarSenha({
          usuarioId: identidadeDe(req).usuarioId,
          ...req.body,
          tokenAtual: tokenDaRequisicao(req),
        });
        return res.status(204).send();
      },
    );

    // O aluno exclui a própria conta, confirmando a senha. Instrutor e admin: 403.
    app.delete<{ Body: { senha: string } }>(
      '/conta',
      {
        onRequest: guarda('aluno'),
        schema: {
          body: {
            type: 'object',
            required: ['senha'],
            properties: { senha: { type: 'string', minLength: 1, maxLength: 128 } },
          },
        },
      },
      async (req, res) => {
        await autenticacao.excluirConta({ usuarioId: identidadeDe(req).usuarioId, ...req.body });
        apagarCookieDeSessao(res, cookie);
        return res.status(204).send();
      },
    );

    // O instrutor gera o código para o aluno que esqueceu a senha e o repassa por fora.
    app.post<{ Params: { id: string } }>(
      '/alunos/:id/codigo-de-redefinicao',
      {
        onRequest: guarda('instrutor'),
        schema: {
          params: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string', minLength: 1 } },
          },
        },
      },
      async (req, res) =>
        res.status(201).send(await autenticacao.gerarCodigoDeRedefinicao(req.params.id)),
    );

    // Pública: quem esqueceu a senha não está logado.
    app.post<{ Body: { email: string; codigo: string; novaSenha: string } }>(
      '/senha/redefinicao',
      {
        schema: {
          body: {
            type: 'object',
            required: ['email', 'codigo', 'novaSenha'],
            properties: {
              email: { type: 'string', minLength: 1, maxLength: 254 },
              codigo: { type: 'string', minLength: 1, maxLength: 20 },
              novaSenha,
            },
          },
        },
      },
      async (req, res) => {
        await autenticacao.redefinirSenha({ ...req.body, origem: req.ip });
        return res.status(204).send();
      },
    );
  };
}
