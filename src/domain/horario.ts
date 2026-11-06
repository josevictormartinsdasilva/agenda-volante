import { DuracaoInvalida } from './erros.js';

const MS_POR_MINUTO = 60_000;
const MINUTOS_POR_HORA = 60;

/**
 * R1: a aula começa em hora cheia.
 * America/Fortaleza é UTC-3 o ano todo (o Brasil não tem mais horário de verão),
 * então a hora cheia local coincide com a hora cheia em UTC e basta olhar os
 * minutos do instante. Se o fuso passasse a ter offset fracionado, isto mudaria.
 */
export function ehHoraCheia(inicio: Date): boolean {
  return inicio.getTime() % (MINUTOS_POR_HORA * MS_POR_MINUTO) === 0;
}

/**
 * R2: a aula dura no máximo `duracaoMinutos` e sempre cabe dentro da hora,
 * sobrando o restante como deslocamento (R3). Por isso o teto é 60.
 */
export function calcularFim(inicio: Date, duracaoMinutos: number): Date {
  if (!Number.isInteger(duracaoMinutos) || duracaoMinutos < 1 || duracaoMinutos > MINUTOS_POR_HORA) {
    throw new DuracaoInvalida(duracaoMinutos);
  }
  return new Date(inicio.getTime() + duracaoMinutos * MS_POR_MINUTO);
}
