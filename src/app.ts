import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { healthRoutes } from './routes/health.js';

/**
 * Monta a aplicação sem subir o servidor.
 * Separar "montar" de "escutar" permite testar com app.inject(), sem abrir porta.
 */
export function buildApp(config: Pick<Config, 'logLevel'>): FastifyInstance {
  // O logger do Fastify é o pino: logs estruturados em JSON desde o primeiro dia.
  const app = Fastify({ logger: { level: config.logLevel } });
  app.register(healthRoutes);
  return app;
}
