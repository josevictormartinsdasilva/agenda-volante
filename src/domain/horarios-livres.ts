import type { Aula } from './tipos.js';

/**
 * Horários que o aluno ainda pode pedir: publicados, no futuro e sem aula reservada (R3, R4).
 * Aula cancelada não ocupa o horário. Devolve uma lista nova, em ordem crescente.
 */
export function horariosLivres(
  disponibilidade: readonly Date[],
  aulas: readonly Aula[],
  agora: Date,
): Date[] {
  const ocupados = new Set(
    aulas.filter((a) => a.status === 'reservada').map((a) => a.inicio.getTime()),
  );

  return disponibilidade
    .filter((inicio) => inicio.getTime() > agora.getTime() && !ocupados.has(inicio.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
}
