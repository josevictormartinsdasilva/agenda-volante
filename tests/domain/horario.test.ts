import { describe, expect, it } from 'vitest';
import { DuracaoInvalida } from '../../src/domain/erros.js';
import { calcularFim, ehHoraCheia } from '../../src/domain/horario.js';

describe('R1: aulas começam em hora cheia', () => {
  // America/Fortaleza é UTC-3 o ano todo (sem horário de verão): 10:00Z = 07:00 local.
  it('aceita um horário em ponto', () => {
    expect(ehHoraCheia(new Date('2026-11-09T10:00:00.000Z'))).toBe(true);
  });

  it('recusa meia hora', () => {
    expect(ehHoraCheia(new Date('2026-11-09T10:30:00.000Z'))).toBe(false);
  });

  it('recusa 1 segundo depois da hora cheia', () => {
    expect(ehHoraCheia(new Date('2026-11-09T10:00:01.000Z'))).toBe(false);
  });

  it('recusa 1 milissegundo depois da hora cheia', () => {
    expect(ehHoraCheia(new Date('2026-11-09T10:00:00.001Z'))).toBe(false);
  });
});

describe('R2: duração da aula', () => {
  const inicio = new Date('2026-11-09T10:00:00.000Z');

  it('termina 50 minutos depois do início', () => {
    expect(calcularFim(inicio, 50)).toEqual(new Date('2026-11-09T10:50:00.000Z'));
  });

  it('aceita até 60 minutos (a hora inteira)', () => {
    expect(calcularFim(inicio, 60)).toEqual(new Date('2026-11-09T11:00:00.000Z'));
  });

  it('não altera a data recebida', () => {
    calcularFim(inicio, 50);
    expect(inicio).toEqual(new Date('2026-11-09T10:00:00.000Z'));
  });

  it.each([0, -10, 61, 50.5])('recusa duração inválida: %s', (minutos) => {
    expect(() => calcularFim(inicio, minutos)).toThrow(DuracaoInvalida);
  });
});
