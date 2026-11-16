/** O mínimo que o encerramento usa da aplicação e do processo (facilita o teste). */
interface Aplicacao {
  close(): Promise<unknown>;
  log: { info(dados: object, mensagem: string): void; error(erro: unknown): void };
}

interface Processo {
  once(sinal: string, tratar: () => void): unknown;
  exit(codigo: number): void;
}

const SINAIS = ['SIGTERM', 'SIGINT'] as const;

/**
 * Encerramento limpo: no `docker stop` (SIGTERM) ou Ctrl+C (SIGINT), o Fastify para de
 * aceitar conexões, termina as requisições em andamento e dispara os ganchos `onClose`
 * (é onde o Prisma desconecta). Só então o processo sai.
 */
export function encerrarAoReceberSinal(app: Aplicacao, processo: Processo = process): void {
  let encerrando = false;
  for (const sinal of SINAIS) {
    processo.once(sinal, () => {
      if (encerrando) return;
      encerrando = true;
      app.log.info({ sinal }, 'encerrando a aplicação');
      app.close().then(
        () => processo.exit(0),
        (erro: unknown) => {
          app.log.error(erro);
          processo.exit(1);
        },
      );
    });
  }
}
