import { describe, expect, it } from 'vitest';
import { DataInvalida } from '../../src/domain/erros.js';
import { intervaloDoDia } from '../../src/domain/horario.js';

describe('intervaloDoDia', () => {
  it('cobre as 24 h do dia no fuso de Fortaleza (UTC-3)', () => {
    const { de, ate } = intervaloDoDia('2026-11-20');

    expect(de.toISOString()).toBe('2026-11-20T03:00:00.000Z');
    expect(ate.toISOString()).toBe('2026-11-21T03:00:00.000Z');
  });

  it.each(['abc', '2026-13-01', '2026-02-30', '20/11/2026', ''])('recusa "%s"', (data) => {
    expect(() => intervaloDoDia(data)).toThrow(DataInvalida);
  });
});
