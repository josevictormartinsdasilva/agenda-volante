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

/**
 * - `admin`: administra contas (cadastra instrutores). Não opera a agenda.
 * - `instrutor`: administra a agenda (alunos, pacotes, disponibilidade).
 * - `aluno`: consulta horários e reserva e cancela as próprias aulas.
 */
export type Papel = 'admin' | 'instrutor' | 'aluno';

/**
 * Conta de acesso. O e-mail é guardado em minúsculas e identifica a conta; a senha nunca
 * é guardada, só o hash. Conta de aluno aponta para o `Aluno`; as demais, para nada.
 */
export interface Usuario {
  readonly id: string;
  readonly email: string;
  readonly senhaHash: string;
  readonly papel: Papel;
  readonly alunoId: string | null;
}

/**
 * Sessão aberta por um login. Guarda o resumo (hash) do token, nunca o token: quem ler o
 * banco não consegue se passar pelo usuário. `papel` e `alunoId` são copiados da conta no
 * login, para identificar a requisição com uma consulta só.
 */
export interface Sessao {
  readonly tokenHash: string;
  readonly usuarioId: string;
  readonly papel: Papel;
  readonly alunoId: string | null;
  readonly expiraEm: Date;
}

/**
 * Código de redefinição de senha: um por conta, de uso único, com validade. Guarda o
 * resumo (hash) do código, nunca o código.
 */
export interface CodigoDeRedefinicao {
  readonly usuarioId: string;
  readonly codigoHash: string;
  readonly expiraEm: Date;
}

/** Quem está fazendo a requisição, depois de conferido o token. */
export interface Identidade {
  readonly usuarioId: string;
  readonly papel: Papel;
  readonly alunoId: string | null;
}
