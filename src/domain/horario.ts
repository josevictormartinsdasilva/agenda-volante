import { DataInvalida, DuracaoInvalida } from './erros.js';

const MS_POR_MINUTO = 60_000;
const MINUTOS_POR_HORA = 60;
const MS_POR_DIA = 24 * MINUTOS_POR_HORA * MS_POR_MINUTO;

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
 * Intervalo [de, ate) em UTC que cobre o dia `data` (AAAA-MM-DD) no fuso America/Fortaleza.
 * Mesmo motivo de `ehHoraCheia`: o offset é fixo em UTC-3, sem horário de verão.
 */
export function intervaloDoDia(data: string): { de: Date; ate: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new DataInvalida(data);

  const de = new Date(`${data}T00:00:00-03:00`);
  // O Date "rola" datas impossíveis (30/02 vira março); ler de volta detecta isso.
  const lidaDeVolta = new Date(de.getTime() - 3 * 60 * MS_POR_MINUTO);
  if (Number.isNaN(de.getTime()) || lidaDeVolta.toISOString().slice(0, 10) !== data) {
    throw new DataInvalida(data);
  }

  return { de, ate: new Date(de.getTime() + MS_POR_DIA) };
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
