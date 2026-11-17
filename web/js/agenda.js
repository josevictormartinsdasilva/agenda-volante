// Contas de horário da interface do instrutor. Funções puras: testadas em tests/web/.

const MS_POR_SEMANA = 7 * 86_400_000;

/**
 * @typedef {{ id: string, alunoId: string, inicio: string, fim: string, status: 'reservada' | 'cancelada' }} Aula
 * @typedef {{ inicio: string, situacao: 'livre' }} HorarioLivre
 * @typedef {{ inicio: string, situacao: 'reservada', aula: Aula, aluno: string }} HorarioReservado
 * @typedef {HorarioLivre | HorarioReservado} HorarioDoDia
 */

/** Horas que o instrutor pode publicar: das 6h às 21h, sempre em hora cheia (R1). */
export const HORAS_DA_GRADE = Array.from({ length: 16 }, (_, i) => i + 6);

/**
 * O instante (ISO, UTC) de uma hora cheia num dia de Fortaleza (UTC-3, sem horário de verão).
 * @param {string} dia AAAA-MM-DD
 * @param {number} hora 0 a 23
 * @returns {string}
 */
export function inicioNoDia(dia, hora) {
  return new Date(`${dia}T${String(hora).padStart(2, '0')}:00:00-03:00`).toISOString();
}

/**
 * Os mesmos horários nas `semanas` seguintes, além dos originais.
 * @param {string[]} inicios
 * @param {number} semanas
 * @returns {string[]}
 */
export function repetirNasSemanas(inicios, semanas) {
  const todos = [];
  for (let semana = 0; semana <= semanas; semana++) {
    for (const inicio of inicios) {
      todos.push(new Date(Date.parse(inicio) + semana * MS_POR_SEMANA).toISOString());
    }
  }
  return todos;
}

/**
 * O dia do instrutor: horários livres e aulas reservadas, em ordem de horário.
 * @param {string[]} livres o que `GET /horarios-livres` devolveu
 * @param {Aula[]} aulas o que `GET /agenda` devolveu (só reservadas)
 * @param {Map<string, string>} nomes nome por id de aluno
 * @returns {HorarioDoDia[]}
 */
export function montarDia(livres, aulas, nomes) {
  /** @type {HorarioDoDia[]} */
  const dia = [
    ...livres.map((inicio) => /** @type {HorarioLivre} */ ({ inicio, situacao: 'livre' })),
    ...aulas.map(
      (aula) =>
        /** @type {HorarioReservado} */ ({
          inicio: aula.inicio,
          situacao: 'reservada',
          aula,
          aluno: nomes.get(aula.alunoId) ?? 'Aluno',
        }),
    ),
  ];
  return dia.sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
}
