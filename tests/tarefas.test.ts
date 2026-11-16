import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { repetirPeriodicamente } from '../src/tarefas.js';

describe('repetirPeriodicamente', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('roda na hora e depois a cada intervalo, até ser parada', async () => {
    const tarefa = vi.fn(async () => {});

    const parar = repetirPeriodicamente(tarefa, 1000, () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(tarefa).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3000);
    expect(tarefa).toHaveBeenCalledTimes(4);

    parar();
    await vi.advanceTimersByTimeAsync(5000);
    expect(tarefa).toHaveBeenCalledTimes(4);
  });

  it('uma falha é entregue a quem trata e não interrompe as próximas execuções', async () => {
    const falha = new Error('banco fora');
    const tarefa = vi.fn().mockRejectedValueOnce(falha).mockResolvedValue(undefined);
    const aoFalhar = vi.fn();

    const parar = repetirPeriodicamente(tarefa, 1000, aoFalhar);
    await vi.advanceTimersByTimeAsync(1000);
    parar();

    expect(aoFalhar).toHaveBeenCalledWith(falha);
    expect(tarefa).toHaveBeenCalledTimes(2);
  });

  it('não começa uma execução enquanto a anterior não terminou', async () => {
    let terminar: () => void = () => {};
    const tarefa = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          terminar = resolve;
        }),
    );

    const parar = repetirPeriodicamente(tarefa, 1000, () => {});
    await vi.advanceTimersByTimeAsync(5000);
    expect(tarefa).toHaveBeenCalledTimes(1);

    terminar();
    await vi.advanceTimersByTimeAsync(1000);
    parar();
    expect(tarefa).toHaveBeenCalledTimes(2);
  });
});
