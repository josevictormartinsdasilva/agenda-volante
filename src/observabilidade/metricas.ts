import type { FastifyInstance } from 'fastify';
import { Histogram, Registry } from 'prom-client';

/** Rótulo das requisições que não casaram com nenhuma rota: um só valor, para não criar uma série por URL. */
const ROTA_NAO_ENCONTRADA = 'nao_encontrada';

/** O endpoint de métricas não se mede: seria ruído a cada coleta do Prometheus. */
const ROTA_DE_METRICAS = '/metrics';

/**
 * Buckets em segundos. O 0.3 coincide com a meta de p95 do SLO (docs/slo.md), então
 * dá para checar "quantas requisições ficaram abaixo da meta" sem interpolar.
 */
const BUCKETS_SEGUNDOS = [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2.5];

/**
 * Mede cada requisição HTTP em `http_request_duration_seconds` (método, rota, status).
 * Uma só métrica serve aos dois SLOs: a contagem por status dá a disponibilidade e os
 * buckets dão a latência. Cada app tem o seu Registry, então testes não se contaminam.
 */
export function instrumentar(app: FastifyInstance): Registry {
  const registry = new Registry();
  const duracao = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duração das requisições HTTP, em segundos',
    labelNames: ['method', 'route', 'status_code'],
    buckets: BUCKETS_SEGUNDOS,
    registers: [registry],
  });

  app.addHook('onResponse', async (req, res) => {
    // Rota declarada ("/aulas/:id/cancelar"), nunca a URL real, para limitar a cardinalidade.
    const rota = req.routeOptions.url ?? ROTA_NAO_ENCONTRADA;
    if (rota === ROTA_DE_METRICAS) return;

    duracao.observe(
      { method: req.method, route: rota, status_code: res.statusCode },
      res.elapsedTime / 1000,
    );
  });

  return registry;
}
