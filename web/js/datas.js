// Datas como o aluno as vê: no fuso de Fortaleza, onde fica a grade de horários.
// A API fala em UTC (ISO 8601); a conversão para exibir acontece só aqui.

const FUSO = 'America/Fortaleza';
const MS_POR_DIA = 86_400_000;

// en-CA formata como AAAA-MM-DD, o mesmo formato do parâmetro `data` da API.
const formatoDoDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const formatoDaHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  hour: '2-digit',
  minute: '2-digit',
});
const formatoDaSemana = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'short' });
const formatoDiaMes = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  day: '2-digit',
  month: '2-digit',
});

/**
 * O dia (AAAA-MM-DD) em que um instante cai em Fortaleza.
 * @param {Date} instante
 * @returns {string}
 */
export function diaEmFortaleza(instante) {
  return formatoDoDia.format(instante);
}

/**
 * Os próximos `quantidade` dias, começando por hoje em Fortaleza.
 * @param {Date} agora
 * @param {number} quantidade
 * @returns {string[]}
 */
export function proximosDias(agora, quantidade) {
  const [ano, mes, dia] = diaEmFortaleza(agora).split('-').map(Number);
  // Meio-dia UTC do dia de hoje: somar dias inteiros nunca troca a data por causa do fuso.
  const base = Date.UTC(ano ?? 0, (mes ?? 1) - 1, dia ?? 1, 12);
  return Array.from({ length: quantidade }, (_, i) =>
    new Date(base + i * MS_POR_DIA).toISOString().slice(0, 10),
  );
}

/**
 * Meio-dia de um dia AAAA-MM-DD em Fortaleza (UTC-3), para formatar sem risco de virar o dia.
 * @param {string} dia
 */
function meioDiaEm(dia) {
  return new Date(`${dia}T12:00:00-03:00`);
}

/**
 * "Hoje", "Amanhã" ou "ter., 24/11".
 * @param {string} dia AAAA-MM-DD
 * @param {string} hoje AAAA-MM-DD
 * @returns {string}
 */
export function rotuloDoDia(dia, hoje) {
  if (dia === hoje) return 'Hoje';
  const amanha = new Date(meioDiaEm(hoje).getTime() + MS_POR_DIA).toISOString().slice(0, 10);
  if (dia === amanha) return 'Amanhã';
  const instante = meioDiaEm(dia);
  return `${formatoDaSemana.format(instante)}, ${formatoDiaMes.format(instante)}`;
}

/**
 * "10:00" para uma aula que começa às 13:00 UTC.
 * @param {string} iso
 * @returns {string}
 */
export function horaEmFortaleza(iso) {
  return formatoDaHora.format(new Date(iso));
}

/**
 * "sex., 20/11 às 10:00".
 * @param {string} iso
 * @returns {string}
 */
export function dataHoraEmFortaleza(iso) {
  const instante = new Date(iso);
  return `${formatoDaSemana.format(instante)}, ${formatoDiaMes.format(instante)} às ${horaEmFortaleza(iso)}`;
}
