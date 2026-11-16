import type { Aluno, Aula, Pacote } from './tipos.js';

/**
 * Portas de persistência (Repository). O domínio e os casos de uso dependem só destas
 * interfaces; há duas implementações (em memória, em `src/infra/memoria/`, e com
 * Prisma, em `src/infra/prisma/`), trocáveis sem mexer nelas. Intervalos são
 * [de, ate), em UTC.
 */
export interface AlunoRepository {
  salvar(aluno: Aluno): Promise<void>;
  buscarPorId(id: string): Promise<Aluno | undefined>;
}

export interface PacoteRepository {
  salvar(pacote: Pacote): Promise<void>;
  buscarPorAluno(alunoId: string): Promise<Pacote | undefined>;
}

export interface DisponibilidadeRepository {
  /** Idempotente: publicar um horário que já existe não o duplica. */
  publicar(inicios: readonly Date[]): Promise<void>;
  listarEntre(de: Date, ate: Date): Promise<Date[]>;
}

export interface AulaRepository {
  /**
   * Insere ou atualiza pelo `id`. Lança `HorarioOcupado` se outra aula reservada já
   * começa no mesmo instante (R3): a restrição vale no armazenamento, não só na checagem.
   */
  salvar(aula: Aula): Promise<void>;
  buscarPorId(id: string): Promise<Aula | undefined>;
  /** Todas as aulas (reservadas e canceladas) que começam no intervalo. */
  listarEntre(de: Date, ate: Date): Promise<Aula[]>;
}

export interface Repositorios {
  alunos: AlunoRepository;
  pacotes: PacoteRepository;
  disponibilidade: DisponibilidadeRepository;
  aulas: AulaRepository;
}
