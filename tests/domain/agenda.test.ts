import { describe, expect, it } from 'vitest';
import { cancelarAula, reservarAula } from '../../src/domain/agenda.js';
import {
  AulaJaCancelada,
  HorarioForaDaGrade,
  HorarioIndisponivel,
  HorarioNoPassado,
  HorarioOcupado,
  SaldoInsuficiente,
} from '../../src/domain/erros.js';
import { CancelamentoComAntecedencia } from '../../src/domain/politica-cancelamento.js';
import type { Aula, Pacote } from '../../src/domain/tipos.js';

const SEGUNDA_7H = new Date('2026-11-09T10:00:00.000Z'); // 07:00 em Fortaleza
const SEGUNDA_8H = new Date('2026-11-09T11:00:00.000Z');
const AGORA = new Date('2026-11-07T12:00:00.000Z'); // dois dias antes da segunda
const regras = { duracaoAulaMinutos: 50 };
const disponibilidade = [SEGUNDA_7H, SEGUNDA_8H];

function pacote(saldo: number): Pacote {
  return { alunoId: 'ana', saldo };
}

function aulaReservada(sobrescrever: Partial<Aula> = {}): Aula {
  return {
    id: 'aula-1',
    alunoId: 'bia',
    inicio: SEGUNDA_7H,
    fim: new Date('2026-11-09T10:50:00.000Z'),
    status: 'reservada',
    ...sobrescrever,
  };
}

function reservar(sobrescrever: Partial<Parameters<typeof reservarAula>[0]> = {}) {
  return reservarAula(
    {
      id: 'aula-2',
      alunoId: 'ana',
      inicio: SEGUNDA_7H,
      disponibilidade,
      aulasReservadas: [],
      pacote: pacote(5),
      agora: AGORA,
      ...sobrescrever,
    },
    regras,
  );
}

describe('reservarAula', () => {
  it('reserva, calcula o fim da aula e consome 1 crédito (R2, R5)', () => {
    const { aula, pacote: depois } = reservar();

    expect(aula).toEqual({
      id: 'aula-2',
      alunoId: 'ana',
      inicio: SEGUNDA_7H,
      fim: new Date('2026-11-09T10:50:00.000Z'),
      status: 'reservada',
    });
    expect(depois.saldo).toBe(4);
  });

  it('não altera o pacote recebido', () => {
    const original = pacote(5);
    reservar({ pacote: original });
    expect(original.saldo).toBe(5);
  });

  it('R1: recusa horário fora da hora cheia, mesmo que esteja na disponibilidade', () => {
    const meiaHora = new Date('2026-11-09T10:30:00.000Z');
    expect(() => reservar({ inicio: meiaHora, disponibilidade: [meiaHora] })).toThrow(
      HorarioForaDaGrade,
    );
  });

  it('R4: recusa horário que o instrutor não publicou', () => {
    const terca = new Date('2026-11-10T10:00:00.000Z');
    expect(() => reservar({ inicio: terca })).toThrow(HorarioIndisponivel);
  });

  it('R3: recusa horário já reservado por outro aluno', () => {
    expect(() => reservar({ aulasReservadas: [aulaReservada()] })).toThrow(HorarioOcupado);
  });

  it('R3: aula cancelada não ocupa o horário', () => {
    const cancelada = aulaReservada({ status: 'cancelada' });
    const { aula } = reservar({ aulasReservadas: [cancelada] });
    expect(aula.status).toBe('reservada');
  });

  it('R3: reserva outro horário livre mesmo havendo aula no mesmo dia', () => {
    const { aula } = reservar({ inicio: SEGUNDA_8H, aulasReservadas: [aulaReservada()] });
    expect(aula.inicio).toEqual(SEGUNDA_8H);
  });

  it('recusa horário que já passou, mesmo publicado e livre', () => {
    const depoisDaAula = new Date('2026-11-09T12:00:00.000Z');
    expect(() => reservar({ agora: depoisDaAula })).toThrow(HorarioNoPassado);
  });

  it('recusa horário que começa exatamente agora (a aula já começou)', () => {
    expect(() => reservar({ agora: SEGUNDA_7H })).toThrow(HorarioNoPassado);
  });

  it('aceita horário que começa 1 milissegundo depois de agora', () => {
    const quaseAgora = new Date(SEGUNDA_7H.getTime() - 1);
    const { aula } = reservar({ agora: quaseAgora });
    expect(aula.inicio).toEqual(SEGUNDA_7H);
  });

  it('horário passado não consome crédito', () => {
    const original = pacote(5);
    expect(() =>
      reservar({ pacote: original, agora: new Date('2026-11-09T12:00:00.000Z') }),
    ).toThrow(HorarioNoPassado);
    expect(original.saldo).toBe(5);
  });

  it('R5: recusa aluno sem saldo e não gera aula', () => {
    expect(() => reservar({ pacote: pacote(0) })).toThrow(SaldoInsuficiente);
  });

  it('R5: usa o último crédito e deixa o saldo em zero', () => {
    const { pacote: depois } = reservar({ pacote: pacote(1) });
    expect(depois.saldo).toBe(0);
  });
});

describe('cancelarAula', () => {
  const politica = new CancelamentoComAntecedencia(48);
  const aula = aulaReservada({ alunoId: 'ana' });

  it('R6: com 48 h ou mais, cancela e devolve o crédito', () => {
    const agora = new Date('2026-11-07T10:00:00.000Z'); // 48 h antes
    const resultado = cancelarAula({ aula, pacote: pacote(4), agora }, politica);

    expect(resultado.aula.status).toBe('cancelada');
    expect(resultado.creditoDevolvido).toBe(true);
    expect(resultado.pacote.saldo).toBe(5);
  });

  it('R6: com menos de 48 h, cancela mas a aula é consumida (saldo não volta)', () => {
    const agora = new Date('2026-11-08T10:00:00.000Z'); // 24 h antes
    const resultado = cancelarAula({ aula, pacote: pacote(4), agora }, politica);

    expect(resultado.aula.status).toBe('cancelada');
    expect(resultado.creditoDevolvido).toBe(false);
    expect(resultado.pacote.saldo).toBe(4);
  });

  it('recusa cancelar uma aula que já foi cancelada', () => {
    const jaCancelada = aulaReservada({ status: 'cancelada' });
    const agora = new Date('2026-11-07T10:00:00.000Z');
    expect(() => cancelarAula({ aula: jaCancelada, pacote: pacote(4), agora }, politica)).toThrow(
      AulaJaCancelada,
    );
  });

  it('não altera a aula nem o pacote recebidos', () => {
    const pacoteOriginal = pacote(4);
    cancelarAula({ aula, pacote: pacoteOriginal, agora: new Date('2026-11-07T10:00:00.000Z') }, politica);

    expect(aula.status).toBe('reservada');
    expect(pacoteOriginal.saldo).toBe(4);
  });
});
