/** Datas sempre em UTC (instantes). A grade de horários é lida no fuso America/Fortaleza. */
export interface Aula {
  readonly id: string;
  readonly alunoId: string;
  readonly inicio: Date;
  readonly fim: Date;
  readonly status: 'reservada' | 'cancelada';
}

export interface Aluno {
  readonly id: string;
  readonly nome: string;
}

/** Pacote de aulas vendido ao aluno. `saldo` é quantas aulas ele ainda pode reservar. */
export interface Pacote {
  readonly alunoId: string;
  readonly saldo: number;
}
