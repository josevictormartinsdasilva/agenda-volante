import Fastify, { type FastifyInstance } from 'fastify';
import { Registry } from 'prom-client';
import type { Autenticacao } from './application/autenticacao.js';
import type { CasosDeUso } from './application/casos-de-uso.js';
import type { Config } from './config.js';
import { instrumentar } from './observabilidade/metricas.js';
import { agendaRoutes } from './routes/agenda.js';
import { autenticacaoRoutes } from './routes/autenticacao.js';
import { contaRoutes } from './routes/conta.js';
import { criarGuarda } from './routes/autorizacao.js';
import { tratarErro } from './routes/erros-http.js';
import { healthRoutes } from './routes/health.js';
import { metricasRoutes } from './routes/metricas.js';

/**
 * Monta a aplicação sem subir o servidor.
 * Separar "montar" de "escutar" permite testar com app.inject(), sem abrir porta.
 * Os casos de uso chegam prontos: quem monta decide qual repositório está por trás.
 */
export interface OpcoesDaApp {
  /** Alimenta o `/ready`. O padrão serve para a memória, que está sempre disponível. */
  verificarArmazenamento?: () => Promise<void>;
  /** Onde as métricas das requisições são registradas (exposto por `buildAppDeMetricas`). */
  registroDeMetricas?: Registry;
}

export function buildApp(
  config: Pick<Config, 'logLevel'> & Partial<Pick<Config, 'trustProxy'>>,
  casos: CasosDeUso,
  autenticacao: Autenticacao,
  opcoes: OpcoesDaApp = {},
): FastifyInstance {
  // O logger do Fastify é o pino: logs estruturados em JSON desde o primeiro dia.
  // Com `trustProxy`, `req.ip` vem do X-Forwarded-For, que só o proxy deve escrever.
  const app = Fastify({
    logger: { level: config.logLevel },
    trustProxy: config.trustProxy ?? false,
  });
  app.setErrorHandler(tratarErro);
  instrumentar(app, opcoes.registroDeMetricas ?? new Registry());
  app.register(healthRoutes(opcoes.verificarArmazenamento ?? (async () => {})));
  // Declarar a propriedade antes mantém o formato do objeto de requisição estável.
  app.decorateRequest('identidade', null);
  const guarda = criarGuarda(autenticacao);
  app.register(autenticacaoRoutes(autenticacao, guarda));
  app.register(contaRoutes(autenticacao, guarda));
  app.register(agendaRoutes(casos, guarda));
  return app;
}

/**
 * Aplicação só com o `/metrics`, para escutar numa porta interna, que não é publicada:
 * quem coleta (o Prometheus) está na mesma rede; quem usa a API não alcança (ADR 0004).
 */
export function buildAppDeMetricas(
  registro: Registry,
  config?: Pick<Config, 'logLevel'>,
): FastifyInstance {
  const app = Fastify({ logger: config ? { level: config.logLevel } : false });
  app.register(metricasRoutes(registro));
  return app;
}
