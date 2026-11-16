import type { FastifyRequest } from 'fastify';
import type { Autenticacao } from '../application/autenticacao.js';
import { AcessoNegado, NaoAutenticado } from '../domain/erros.js';
import type { Identidade, Papel } from '../domain/tipos.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Preenchida pela guarda; nula nas rotas públicas. */
    identidade: Identidade | null;
  }
}

/** Extrai o token de `Authorization: Bearer <token>`. */
export function tokenDaRequisicao(req: FastifyRequest): string {
  const [esquema, token] = (req.headers.authorization ?? '').split(' ');
  if (esquema !== 'Bearer' || !token) throw new NaoAutenticado();
  return token;
}

export type Guarda = (...papeis: Papel[]) => (req: FastifyRequest) => Promise<void>;

/**
 * Guarda das rotas: `guarda('instrutor')` devolve um gancho `onRequest` que só deixa
 * passar quem está logado (senão 401) com um dos papéis listados (senão 403).
 * Roda antes da validação do corpo: quem não está logado não descobre o formato esperado.
 */
export function criarGuarda(autenticacao: Autenticacao): Guarda {
  return (...papeis) =>
    async (req) => {
      const identidade = await autenticacao.identificar(tokenDaRequisicao(req));
      if (!papeis.includes(identidade.papel)) throw new AcessoNegado();
      req.identidade = identidade;
    };
}

/** Identidade de uma rota protegida. Só falha se a rota foi registrada sem guarda. */
export function identidadeDe(req: FastifyRequest): Identidade {
  if (!req.identidade) throw new NaoAutenticado();
  return req.identidade;
}
