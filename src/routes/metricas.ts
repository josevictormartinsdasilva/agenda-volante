import type { FastifyInstance } from 'fastify';
import type { Registry } from 'prom-client';

export function metricasRoutes(registry: Registry) {
  return async (app: FastifyInstance): Promise<void> => {
    app.get('/metrics', async (_req, res) => {
      res.header('content-type', registry.contentType);
      return registry.metrics();
    });
  };
}
