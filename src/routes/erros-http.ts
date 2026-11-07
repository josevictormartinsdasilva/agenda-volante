import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import {
  AlunoNaoEncontrado,
  AulaJaCancelada,
  AulaNaoEncontrada,
  DataInvalida,
  ErroDeDominio,
  HorarioForaDaGrade,
  HorarioIndisponivel,
  HorarioNoPassado,
  HorarioOcupado,
  SaldoInsuficiente,
} from '../domain/erros.js';

type ClasseDeErro = new (...args: never[]) => ErroDeDominio;

/** Cada regra violada vira um status HTTP; o texto da mensagem nunca é inspecionado. */
const STATUS_POR_ERRO: ReadonlyArray<readonly [ClasseDeErro, number]> = [
  [DataInvalida, 400],
  [AlunoNaoEncontrado, 404],
  [AulaNaoEncontrada, 404],
  [HorarioOcupado, 409],
  [AulaJaCancelada, 409],
  [HorarioForaDaGrade, 422],
  [HorarioNoPassado, 422],
  [HorarioIndisponivel, 422],
  [SaldoInsuficiente, 422],
];

export function tratarErro(erro: FastifyError, requisicao: FastifyRequest, resposta: FastifyReply) {
  const par = STATUS_POR_ERRO.find(([classe]) => erro instanceof classe);
  if (par) return resposta.status(par[1]).send({ erro: erro.message });

  // Validação do schema (corpo, parâmetros, query) do próprio Fastify.
  if (erro.validation) return resposta.status(400).send({ erro: erro.message });

  requisicao.log.error(erro);
  return resposta.status(500).send({ erro: 'Erro interno' });
}
