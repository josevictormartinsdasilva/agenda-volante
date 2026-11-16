import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import {
  AcessoNegado,
  AlunoNaoEncontrado,
  AulaJaCancelada,
  AulaNaoEncontrada,
  CredenciaisInvalidas,
  DataInvalida,
  EmailJaCadastrado,
  ErroDeDominio,
  HorarioForaDaGrade,
  HorarioIndisponivel,
  HorarioNoPassado,
  HorarioOcupado,
  MuitasTentativas,
  NaoAutenticado,
  SaldoInsuficiente,
} from '../domain/erros.js';

type ClasseDeErro = new (...args: never[]) => ErroDeDominio;

/** Cada regra violada vira um status HTTP; o texto da mensagem nunca é inspecionado. */
const STATUS_POR_ERRO: ReadonlyArray<readonly [ClasseDeErro, number]> = [
  [DataInvalida, 400],
  [CredenciaisInvalidas, 401],
  [NaoAutenticado, 401],
  [AcessoNegado, 403],
  [AlunoNaoEncontrado, 404],
  [AulaNaoEncontrada, 404],
  [HorarioOcupado, 409],
  [AulaJaCancelada, 409],
  [EmailJaCadastrado, 409],
  [MuitasTentativas, 429],
  [HorarioForaDaGrade, 422],
  [HorarioNoPassado, 422],
  [HorarioIndisponivel, 422],
  [SaldoInsuficiente, 422],
];

export function tratarErro(erro: FastifyError, requisicao: FastifyRequest, resposta: FastifyReply) {
  const par = STATUS_POR_ERRO.find(([classe]) => erro instanceof classe);
  if (par) {
    // Diz ao cliente quando pode tentar de novo (RFC 9110, seção 10.2.3).
    if (erro instanceof MuitasTentativas) resposta.header('retry-after', String(erro.segundos));
    return resposta.status(par[1]).send({ erro: erro.message });
  }

  // Validação do schema (corpo, parâmetros, query) do próprio Fastify.
  if (erro.validation) return resposta.status(400).send({ erro: erro.message });

  // Erros do cliente que o próprio Fastify detecta (corpo vazio ou JSON malformado com
  // content-type json, tipo de mídia não suportado). Sem isto viravam 500 por engano.
  const status = erro.statusCode;
  if (status !== undefined && status >= 400 && status < 500) {
    return resposta.status(status).send({ erro: erro.message });
  }

  requisicao.log.error(erro);
  return resposta.status(500).send({ erro: 'Erro interno' });
}
