import { describe, expect, it } from 'vitest';
import { horariosLivres } from '../../src/domain/horarios-livres.js';
import type { Aula } from '../../src/domain/tipos.js';

const AGORA = new Date('2026-11-10T12:00:00.000Z');
const H10 = new Date('2026-11-20T13:00:00.000Z'); // 10h em Fortaleza
const H11 = new Date('2026-11-20T14:00:00.000Z');
const H12 = new Date('2026-11-20T15:00:00.000Z');

function aula(inicio: Date, status: Aula['status'] = 'reservada'): Aula {
  return {
    id: `aula-${inicio.toISOString()}`,
    alunoId: 'ana',
    inicio,
    fim: new Date(inicio.getTime() + 50 * 60_000),
    status,
  };
}

describe('horariosLivres', () => {
  it('remove os horários que já têm aula reservada', () => {
    const livres = horariosLivres([H10, H11, H12], [aula(H11)], AGORA);

    expect(livres).toEqual([H10, H12]);
  });

  it('devolve o horário de uma aula cancelada', () => {
    const livres = horariosLivres([H10, H11], [aula(H10, 'cancelada')], AGORA);

    expect(livres).toEqual([H10, H11]);
  });

  it('não oferece horário que já começou ou já passou', () => {
    const passado = new Date('2026-11-10T11:00:00.000Z');

    const livres = horariosLivres([passado, AGORA, H10], [], AGORA);

    expect(livres).toEqual([H10]);
  });

  it('devolve em ordem crescente, sem alterar a lista recebida', () => {
    const disponibilidade = [H12, H10, H11];

    const livres = horariosLivres(disponibilidade, [], AGORA);

    expect(livres).toEqual([H10, H11, H12]);
    expect(disponibilidade).toEqual([H12, H10, H11]);
  });
});
