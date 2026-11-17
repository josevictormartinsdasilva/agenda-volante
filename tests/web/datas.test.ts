import { describe, expect, it } from 'vitest';
import {
  dataHoraEmFortaleza,
  diaEmFortaleza,
  horaEmFortaleza,
  proximosDias,
  rotuloDoDia,
} from '../../web/js/datas.js';

describe('datas no fuso de Fortaleza (interface)', () => {
  it('o dia é o de Fortaleza, não o de UTC', () => {
    // 01:30 UTC do dia 21 ainda é 22:30 do dia 20 em Fortaleza (UTC-3).
    expect(diaEmFortaleza(new Date('2026-11-21T01:30:00.000Z'))).toBe('2026-11-20');
    expect(diaEmFortaleza(new Date('2026-11-21T03:00:00.000Z'))).toBe('2026-11-21');
  });

  it('lista os próximos dias a partir de hoje, atravessando o fim do mês', () => {
    const agora = new Date('2026-11-29T23:30:00.000Z'); // 20:30 de 29/11 em Fortaleza

    expect(proximosDias(agora, 4)).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
  });

  it('mostra a hora de uma aula como em Fortaleza', () => {
    expect(horaEmFortaleza('2026-11-20T13:00:00.000Z')).toBe('10:00');
    expect(horaEmFortaleza('2026-11-21T00:00:00.000Z')).toBe('21:00');
  });

  it('dá nome aos dias: hoje, amanhã e os demais com dia da semana', () => {
    expect(rotuloDoDia('2026-11-20', '2026-11-20')).toBe('Hoje');
    expect(rotuloDoDia('2026-11-21', '2026-11-20')).toBe('Amanhã');
    expect(rotuloDoDia('2026-11-24', '2026-11-20')).toBe('ter., 24/11');
  });

  it('descreve data e hora de uma aula', () => {
    expect(dataHoraEmFortaleza('2026-11-20T13:00:00.000Z')).toBe('sex., 20/11 às 10:00');
  });
});
