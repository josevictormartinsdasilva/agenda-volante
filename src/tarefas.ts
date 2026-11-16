/**
 * Roda `tarefa` agora e depois a cada `intervaloMs`, até a função devolvida ser chamada.
 * Uma falha vai para `aoFalhar` e não interrompe as próximas execuções; se uma execução
 * demora mais que o intervalo, a seguinte é pulada em vez de rodar em paralelo.
 * O relógio não segura o processo aberto (`unref`): ele pode encerrar normalmente.
 */
export function repetirPeriodicamente(
  tarefa: () => Promise<void>,
  intervaloMs: number,
  aoFalhar: (erro: unknown) => void,
): () => void {
  let rodando = false;

  const executar = async () => {
    if (rodando) return;
    rodando = true;
    try {
      await tarefa();
    } catch (erro) {
      aoFalhar(erro);
    } finally {
      rodando = false;
    }
  };

  void executar();
  const relogio = setInterval(() => void executar(), intervaloMs);
  relogio.unref();
  return () => clearInterval(relogio);
}
