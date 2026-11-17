import { describe, expect, it } from 'vitest';
import { HORAS_DA_GRADE, inicioNoDia, montarDia, repetirNasSemanas } from '../../web/js/agenda.js';

describe('horários da grade (interface do instrutor)', () => {
  it('a grade vai das 6h às 21h, em hora cheia', () => {
    expect(HORAS_DA_GRADE[0]).toBe(6);
    expect(HORAS_DA_GRADE.at(-1)).toBe(21);
    expect(HORAS_DA_GRADE).toHaveLength(16);
  });

  it('a hora escolhida é a de Fortaleza, enviada em UTC', () => {
    expect(inicioNoDia('2026-11-20', 10)).toBe('2026-11-20T13:00:00.000Z');
    expect(inicioNoDia('2026-11-20', 21)).toBe('2026-11-21T00:00:00.000Z');
    expect(inicioNoDia('2026-11-20', 6)).toBe('2026-11-20T09:00:00.000Z');
  });

  it('repetir nas próximas semanas soma 7 dias a cada uma, sem perder os originais', () => {
    const inicios = ['2026-11-20T13:00:00.000Z', '2026-11-20T14:00:00.000Z'];

    expect(repetirNasSemanas(inicios, 0)).toEqual(inicios);
    expect(repetirNasSemanas(inicios, 2)).toEqual([
      '2026-11-20T13:00:00.000Z',
      '2026-11-20T14:00:00.000Z',
      '2026-11-27T13:00:00.000Z',
      '2026-11-27T14:00:00.000Z',
      '2026-12-04T13:00:00.000Z',
      '2026-12-04T14:00:00.000Z',
    ]);
  });

  it('monta o dia juntando horários livres e aulas reservadas, em ordem, com o nome do aluno', () => {
    const livres = ['2026-11-20T14:00:00.000Z', '2026-11-20T09:00:00.000Z'];
    const aulas = [
      {
        id: 'a1',
        alunoId: 'ana',
        inicio: '2026-11-20T13:00:00.000Z',
        fim: '2026-11-20T13:50:00.000Z',
        status: 'reservada' as const,
      },
    ];
    const nomes = new Map([['ana', 'Ana']]);

    expect(montarDia(livres, aulas, nomes)).toEqual([
      { inicio: '2026-11-20T09:00:00.000Z', situacao: 'livre' },
      { inicio: '2026-11-20T13:00:00.000Z', situacao: 'reservada', aula: aulas[0], aluno: 'Ana' },
      { inicio: '2026-11-20T14:00:00.000Z', situacao: 'livre' },
    ]);
  });

  it('aluno que não está na lista aparece como "Aluno"', () => {
    const aula = {
      id: 'a1',
      alunoId: 'sumiu',
      inicio: '2026-11-20T13:00:00.000Z',
      fim: '2026-11-20T13:50:00.000Z',
      status: 'reservada' as const,
    };

    expect(montarDia([], [aula], new Map())[0]).toMatchObject({ aluno: 'Aluno' });
  });
});
