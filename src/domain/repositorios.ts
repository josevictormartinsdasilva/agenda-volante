import type { Aluno, Aula, Pacote, Papel, Sessao, Usuario } from './tipos.js';

/**
 * Portas de persistência (Repository). O domínio e os casos de uso dependem só destas
 * interfaces; há duas implementações (em memória, em `src/infra/memoria/`, e com
 * Prisma, em `src/infra/prisma/`), trocáveis sem mexer nelas. Intervalos são
 * [de, ate), em UTC.
 */
export interface AlunoRepository {
  salvar(aluno: Aluno): Promise<void>;
  buscarPorId(id: string): Promise<Aluno | undefined>;
  /** Todos os alunos, em ordem de nome. */
  listar(): Promise<Aluno[]>;
}

export interface UsuarioRepository {
  /**
   * Insere a conta. Lança `EmailJaCadastrado` se o e-mail já tem conta: a unicidade vale
   * no armazenamento, então dois cadastros simultâneos com o mesmo e-mail não passam juntos.
   */
  criar(usuario: Usuario): Promise<void>;
  buscarPorEmail(email: string): Promise<Usuario | undefined>;
  listarPorPapel(papel: Papel): Promise<Usuario[]>;
}

export interface SessaoRepository {
  salvar(sessao: Sessao): Promise<void>;
  buscar(tokenHash: string): Promise<Sessao | undefined>;
  /** Idempotente: remover uma sessão que não existe não é erro. */
  remover(tokenHash: string): Promise<void>;
  /** Remove as sessões que expiram até `ate` (inclusive). Devolve quantas removeu. */
  removerExpiradas(ate: Date): Promise<number>;
}

/**
 * O saldo só muda por operações atômicas (`creditar` e `debitar`). Não existe "gravar
 * o saldo que eu calculei": quem lê, calcula e grava perde a atualização de quem gravou
 * no meio do caminho (ADR 0002).
 */
export interface PacoteRepository {
  /** Soma `quantidade` ao saldo, criando o pacote se o aluno ainda não tem. */
  creditar(alunoId: string, quantidade: number): Promise<Pacote>;
  /**
   * Consome 1 crédito. Lança `SaldoInsuficiente` se não há pacote ou o saldo é zero (R5):
   * a checagem e o débito são uma operação só, então o saldo nunca fica negativo.
   */
  debitar(alunoId: string): Promise<Pacote>;
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
  /**
   * Passa a aula de reservada para cancelada e devolve `true`. Devolve `false`, sem
   * alterar nada, se não há aula reservada com esse `id` (já cancelada ou inexistente):
   * de dois cancelamentos simultâneos, só um recebe `true`.
   */
  cancelar(id: string): Promise<boolean>;
  buscarPorId(id: string): Promise<Aula | undefined>;
  /** Todas as aulas (reservadas e canceladas) que começam no intervalo. */
  listarEntre(de: Date, ate: Date): Promise<Aula[]>;
}

export interface Repositorios {
  alunos: AlunoRepository;
  usuarios: UsuarioRepository;
  sessoes: SessaoRepository;
  pacotes: PacoteRepository;
  disponibilidade: DisponibilidadeRepository;
  aulas: AulaRepository;
}

/**
 * Repositórios mais a transação (unidade de trabalho). Tudo o que `trabalho` gravar pelos
 * repositórios que recebe vale junto ou não vale: se ele lançar, nada fica gravado.
 */
export interface Armazenamento extends Repositorios {
  emTransacao<T>(trabalho: (repos: Repositorios) => Promise<T>): Promise<T>;
}
