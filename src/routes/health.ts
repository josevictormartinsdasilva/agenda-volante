import type { FastifyInstance } from 'fastify';

/** Tempo máximo de espera pelo armazenamento antes de responder "não pronto". */
const LIMITE_PADRAO_MS = 2000;

function comLimite(trabalho: Promise<void>, limiteMs: number): Promise<void> {
  let relogio: NodeJS.Timeout | undefined;
  const estouro = new Promise<never>((_resolve, reject) => {
    relogio = setTimeout(() => reject(new Error(`sem resposta em ${limiteMs} ms`)), limiteMs);
  });
  return Promise.race([trabalho, estouro]).finally(() => clearTimeout(relogio));
}

/**
 * Duas perguntas diferentes:
 * - `/health` (liveness): o processo está de pé? Não toca em nada externo; se falhar,
 *   o remédio é reiniciar o contêiner.
 * - `/ready` (readiness): dá para atender agora? Consulta o armazenamento; se falhar,
 *   reiniciar a API não resolve, o problema está no banco.
 */
export function healthRoutes(verificar: () => Promise<void>, limiteMs = LIMITE_PADRAO_MS) {
  return async (app: FastifyInstance): Promise<void> => {
    app.get('/health', async () => ({ status: 'ok' }));

    app.get('/ready', async (req, res) => {
      try {
        await comLimite(verificar(), limiteMs);
        return { status: 'ok' };
      } catch (erro) {
        req.log.warn({ err: erro }, 'armazenamento indisponível');
        return res.status(503).send({ status: 'indisponivel' });
      }
    });
  };
}
