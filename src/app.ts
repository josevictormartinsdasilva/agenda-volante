import Fastify, { type FastifyInstance } from 'fastify';
import type { Autenticacao } from './application/autenticacao.js';
import type { CasosDeUso } from './application/casos-de-uso.js';
import type { Config } from './config.js';
import { instrumentar } from './observabilidade/metricas.js';
import { agendaRoutes } from './routes/agenda.js';
import { autenticacaoRoutes } from './routes/autenticacao.js';
import { criarGuarda } from './routes/autorizacao.js';
import { tratarErro } from './routes/erros-http.js';
import { healthRoutes } from './routes/health.js';
import { metricasRoutes } from './routes/metricas.js';

/**
 * Monta a aplicação sem subir o servidor.
 * Separar "montar" de "escutar" permite testar com app.inject(), sem abrir porta.
 * Os casos de uso chegam prontos: quem monta decide qual repositório está por trás.
 * `verificarArmazenamento` alimenta o `/ready`; o padrão serve para a memória, que está
 * sempre disponível.
 */
export function buildApp(
  config: Pick<Config, 'logLevel'>,
  casos: CasosDeUso,
  autenticacao: Autenticacao,
  verificarArmazenamento: () => Promise<void> = async () => {},
): FastifyInstance {
  // O logger do Fastify é o pino: logs estruturados em JSON desde o primeiro dia.
  const app = Fastify({ logger: { level: config.logLevel } });
  app.setErrorHandler(tratarErro);
  const registry = instrumentar(app);
  app.register(healthRoutes(verificarArmazenamento));
  app.register(metricasRoutes(registry));
  // Declarar a propriedade antes mantém o formato do objeto de requisição estável.
  app.decorateRequest('identidade', null);
  const guarda = criarGuarda(autenticacao);
  app.register(autenticacaoRoutes(autenticacao, guarda));
  app.register(agendaRoutes(casos, guarda));
  return app;
}
