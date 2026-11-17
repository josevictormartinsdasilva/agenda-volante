import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { Registry } from 'prom-client';
import type { Autenticacao } from './application/autenticacao.js';
import type { CasosDeUso } from './application/casos-de-uso.js';
import type { Config } from './config.js';
import { instrumentar } from './observabilidade/metricas.js';
import { agendaRoutes } from './routes/agenda.js';
import { autenticacaoRoutes } from './routes/autenticacao.js';
import { contaRoutes } from './routes/conta.js';
import { criarGuarda, type OpcoesDoCookie } from './routes/autorizacao.js';
import { tratarErro } from './routes/erros-http.js';
import { healthRoutes } from './routes/health.js';
import { metricasRoutes } from './routes/metricas.js';

/**
 * Monta a aplicação sem subir o servidor.
 * Separar "montar" de "escutar" permite testar com app.inject(), sem abrir porta.
 * Os casos de uso chegam prontos: quem monta decide qual repositório está por trás.
 */
/** A interface web (HTML, CSS e JS sem build). De src/ ou de dist/, fica um nível acima. */
const PASTA_DA_INTERFACE = fileURLToPath(new URL('../web', import.meta.url));

/**
 * Só o que vem do próprio site roda na página: nenhum script inline nem de terceiros.
 * Se um texto malicioso escapar para o HTML, o navegador não o executa.
 */
const POLITICA_DE_CONTEUDO = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export interface OpcoesDaApp {
  /** Alimenta o `/ready`. O padrão serve para a memória, que está sempre disponível. */
  verificarArmazenamento?: () => Promise<void>;
  /** Onde as métricas das requisições são registradas (exposto por `buildAppDeMetricas`). */
  registroDeMetricas?: Registry;
}

export function buildApp(
  config: Pick<Config, 'logLevel'> &
    Partial<Pick<Config, 'trustProxy' | 'cookieSeguro' | 'sessaoDuracaoHoras'>>,
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
  const cookie: OpcoesDoCookie = {
    seguro: config.cookieSeguro ?? true,
    maxAgeSegundos: (config.sessaoDuracaoHoras ?? 168) * 3600,
  };
  app.register(autenticacaoRoutes(autenticacao, guarda, cookie));
  app.register(contaRoutes(autenticacao, guarda, cookie));
  app.register(agendaRoutes(casos, guarda));

  // `wildcard: false`: registra uma rota por arquivo que existe na pasta, na subida.
  // Nada de rota coringa: um caminho com ".." ou um arquivo fora da pasta dá 404.
  app.register(fastifyStatic, {
    root: PASTA_DA_INTERFACE,
    wildcard: false,
    setHeaders: (res) => {
      res.header('content-security-policy', POLITICA_DE_CONTEUDO);
      res.header('x-content-type-options', 'nosniff');
      res.header('referrer-policy', 'no-referrer');
    },
  });
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
