import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { encerrarAoReceberSinal } from '../src/encerramento.js';

function criarCenario(close: () => Promise<void>) {
  const processo = Object.assign(new EventEmitter(), { exit: vi.fn() });
  const app = { close: vi.fn(close), log: { info: vi.fn(), error: vi.fn() } };
  encerrarAoReceberSinal(app, processo);
  return { processo, app };
}

describe('encerramento limpo', () => {
  it.each(['SIGTERM', 'SIGINT'])('ao receber %s fecha a aplicação e sai com código 0', async (sinal) => {
    const { processo, app } = criarCenario(async () => {});

    processo.emit(sinal);
    await vi.waitFor(() => expect(processo.exit).toHaveBeenCalled());

    expect(app.close).toHaveBeenCalledTimes(1);
    expect(processo.exit).toHaveBeenCalledWith(0);
  });

  it('se o fechamento falha, registra o erro e sai com código 1', async () => {
    const falha = new Error('não fechou');
    const { processo, app } = criarCenario(() => Promise.reject(falha));

    processo.emit('SIGTERM');
    await vi.waitFor(() => expect(processo.exit).toHaveBeenCalled());

    expect(app.log.error).toHaveBeenCalledWith(falha);
    expect(processo.exit).toHaveBeenCalledWith(1);
  });

  it('um segundo sinal durante o fechamento não fecha de novo', async () => {
    const { processo, app } = criarCenario(async () => {});

    processo.emit('SIGTERM');
    processo.emit('SIGINT');
    await vi.waitFor(() => expect(processo.exit).toHaveBeenCalled());

    expect(app.close).toHaveBeenCalledTimes(1);
  });
});
