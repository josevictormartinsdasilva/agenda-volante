import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Autenticacao } from '../application/autenticacao.js';
import { AcessoNegado, NaoAutenticado } from '../domain/erros.js';
import type { Identidade, Papel } from '../domain/tipos.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Preenchida pela guarda; nula nas rotas públicas. */
    identidade: Identidade | null;
  }
}

/** Nome do cookie da sessão usado pela interface web (ADR 0006). */
export const COOKIE_DE_SESSAO = 'sessao';

export interface OpcoesDoCookie {
  /** `Secure`: o navegador só envia o cookie por HTTPS (desligue só em http local). */
  seguro: boolean;
  /** Validade do cookie; a mesma da sessão. */
  maxAgeSegundos: number;
}

/** Valor de um cookie do cabeçalho `Cookie` (`a=1; sessao=xyz`), ou undefined. */
function lerCookie(req: FastifyRequest, nome: string): string | undefined {
  for (const par of (req.headers.cookie ?? '').split(';')) {
    const separador = par.indexOf('=');
    if (separador > 0 && par.slice(0, separador).trim() === nome) {
      return par.slice(separador + 1).trim() || undefined;
    }
  }
  return undefined;
}

/**
 * O token da requisição. Com cabeçalho `Authorization`, só ele vale (`Bearer <token>`):
 * é o que usam curl, k6 e outros clientes. Sem cabeçalho, vale o cookie da sessão, que é
 * o que o navegador manda.
 */
export function tokenDaRequisicao(req: FastifyRequest): string {
  const cabecalho = req.headers.authorization;
  if (cabecalho !== undefined) {
    const [esquema, token] = cabecalho.split(' ');
    if (esquema !== 'Bearer' || !token) throw new NaoAutenticado();
    return token;
  }
  const doCookie = lerCookie(req, COOKIE_DE_SESSAO);
  if (!doCookie) throw new NaoAutenticado();
  return doCookie;
}

/**
 * `HttpOnly`: o JavaScript da página não lê o token (um script injetado não o rouba).
 * `SameSite=Strict`: o navegador não manda o cookie em pedidos vindos de outro site,
 * o que barra CSRF sem precisar de token anti-CSRF.
 */
function atributosDoCookie(seguro: boolean, maxAgeSegundos: number): string {
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSegundos}${seguro ? '; Secure' : ''}`;
}

export function gravarCookieDeSessao(res: FastifyReply, token: string, opcoes: OpcoesDoCookie): void {
  res.header('set-cookie', `${COOKIE_DE_SESSAO}=${token}; ${atributosDoCookie(opcoes.seguro, opcoes.maxAgeSegundos)}`);
}

export function apagarCookieDeSessao(res: FastifyReply, opcoes: OpcoesDoCookie): void {
  res.header('set-cookie', `${COOKIE_DE_SESSAO}=; ${atributosDoCookie(opcoes.seguro, 0)}`);
}

/** Padrão quando quem monta as rotas não informa (testes de contrato). */
export const COOKIE_PADRAO: OpcoesDoCookie = { seguro: true, maxAgeSegundos: 168 * 3600 };

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
