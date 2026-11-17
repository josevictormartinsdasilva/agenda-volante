import { cancelarAula, reservarAula } from '../domain/agenda.js';
import {
  AlunoNaoEncontrado,
  AulaJaCancelada,
  AulaNaoEncontrada,
  HorarioComAulaReservada,
  HorarioForaDaGrade,
  HorarioIndisponivel,
  RetiradaNoPassado,
} from '../domain/erros.js';
import { ehHoraCheia, intervaloDoDia } from '../domain/horario.js';
import { horariosLivres } from '../domain/horarios-livres.js';
import type { PoliticaDeCancelamento } from '../domain/politica-cancelamento.js';
import type { Armazenamento } from '../domain/repositorios.js';
import type { Aluno, Aula, Pacote } from '../domain/tipos.js';

const MS_POR_HORA = 3_600_000;

export interface Dependencias {
  repositorios: Armazenamento;
  duracaoAulaMinutos: number;
  politica: PoliticaDeCancelamento;
  /** Relógio e gerador de id injetados: os testes controlam o tempo e os ids. */
  agora: () => Date;
  gerarId: () => string;
}

export interface CasosDeUso {
  /**
   * Alunos em ordem de nome, com o e-mail da conta (nulo se o aluno não tem conta) e o saldo
   * do pacote (zero se nunca recebeu crédito).
   */
  listarAlunos(): Promise<Array<Aluno & { email: string | null; saldo: number }>>;
  registrarPacote(alunoId: string, quantidade: number): Promise<Pacote>;
  publicarDisponibilidade(inicios: readonly Date[]): Promise<void>;
  /**
   * Retira um horário publicado (futuro). Se há aula reservada nele, só retira com
   * `cancelarAula: true`: a aula é cancelada e o crédito volta ao aluno, qualquer que
   * seja a antecedência (R6 não se aplica: quem desistiu foi o instrutor).
   */
  retirarDisponibilidade(
    inicio: Date,
    opcoes?: { cancelarAula?: boolean },
  ): Promise<{ aulaCancelada: Aula | null }>;
  consultarHorariosLivres(data: string): Promise<Date[]>;
  reservarAula(alunoId: string, inicio: Date): Promise<{ aula: Aula; pacote: Pacote }>;
  consultarAgenda(data: string): Promise<Aula[]>;
  /** As aulas do aluno (qualquer status, em ordem de início) e o saldo do pacote. */
  aulasDoAluno(alunoId: string): Promise<{ saldo: number; aulas: Aula[] }>;
  /**
   * Com `solicitante`, só cancela se a aula é desse aluno; a de outro aluno responde
   * "não encontrada", para não revelar que ela existe. Sem ele (instrutor), cancela qualquer uma.
   */
  cancelarAula(
    aulaId: string,
    solicitante?: { alunoId: string },
  ): Promise<{ aula: Aula; pacote: Pacote; creditoDevolvido: boolean }>;
}

/**
 * Orquestra o fluxo principal: busca os dados nos repositórios, chama as funções
 * puras do domínio e persiste o resultado. As regras ficam no domínio, não aqui.
 *
 * Ler, validar e gravar são passos separados, então duas requisições simultâneas podem
 * passar juntas pela checagem do domínio, que valida um retrato já lido. Por isso a
 * gravação reaplica cada condição de forma atômica no armazenamento (ADR 0002):
 * `aulas.salvar` recusa o segundo horário (R3), `pacotes.debitar` recusa o débito sem
 * saldo (R5) e `aulas.cancelar` recusa o segundo cancelamento (R6). Aula e pacote são
 * gravados na mesma transação: se uma gravação falha, a outra é desfeita.
 */
export function criarCasosDeUso(dep: Dependencias): CasosDeUso {
  const { repositorios: repos } = dep;

  async function exigirAluno(alunoId: string): Promise<Aluno> {
    const aluno = await repos.alunos.buscarPorId(alunoId);
    if (!aluno) throw new AlunoNaoEncontrado();
    return aluno;
  }

  async function pacoteDoAluno(alunoId: string, pacotes = repos.pacotes): Promise<Pacote> {
    return (await pacotes.buscarPorAluno(alunoId)) ?? { alunoId, saldo: 0 };
  }

  return {
    async listarAlunos() {
      // Três consultas para a lista inteira, não uma por aluno.
      const [alunos, contas, pacotes] = await Promise.all([
        repos.alunos.listar(),
        repos.usuarios.listarPorPapel('aluno'),
        repos.pacotes.listar(),
      ]);
      const emailPorAluno = new Map(contas.map((conta) => [conta.alunoId, conta.email]));
      const saldoPorAluno = new Map(pacotes.map((pacote) => [pacote.alunoId, pacote.saldo]));
      return alunos.map((aluno) => ({
        ...aluno,
        email: emailPorAluno.get(aluno.id) ?? null,
        saldo: saldoPorAluno.get(aluno.id) ?? 0,
      }));
    },

    async registrarPacote(alunoId, quantidade) {
      await exigirAluno(alunoId);
      return repos.pacotes.creditar(alunoId, quantidade);
    },

    async publicarDisponibilidade(inicios) {
      // R1 vale já na publicação: o instrutor não publica horário fora da grade.
      if (!inicios.every(ehHoraCheia)) throw new HorarioForaDaGrade();
      await repos.disponibilidade.publicar(inicios);
    },

    async retirarDisponibilidade(inicio, opcoes = {}) {
      if (inicio.getTime() <= dep.agora().getTime()) throw new RetiradaNoPassado();

      return repos.emTransacao(async (tx) => {
        // Apagar primeiro e só então procurar a aula: o DELETE espera uma reserva em
        // andamento terminar (ela travou o horário), então a busca abaixo já a enxerga.
        if (!(await tx.disponibilidade.retirar(inicio))) throw new HorarioIndisponivel();

        const aulas = await tx.aulas.listarEntre(inicio, new Date(inicio.getTime() + 1));
        const aula = aulas.find((a) => a.status === 'reservada');
        if (!aula) return { aulaCancelada: null };

        // Lançar desfaz a retirada: sem confirmação, nada muda.
        if (!opcoes.cancelarAula) throw new HorarioComAulaReservada();

        // Se o próprio aluno cancelou no meio do caminho, o crédito já foi tratado por R6.
        if (!(await tx.aulas.cancelar(aula.id))) return { aulaCancelada: null };
        // Quem desistiu do horário foi o instrutor: o crédito volta sempre, sem R6.
        await tx.pacotes.creditar(aula.alunoId, 1);
        return { aulaCancelada: { ...aula, status: 'cancelada' as const } };
      });
    },

    async consultarHorariosLivres(data) {
      const { de, ate } = intervaloDoDia(data);
      const [publicados, aulas] = await Promise.all([
        repos.disponibilidade.listarEntre(de, ate),
        repos.aulas.listarEntre(de, ate),
      ]);
      return horariosLivres(publicados, aulas, dep.agora());
    },

    async reservarAula(alunoId, inicio) {
      await exigirAluno(alunoId);
      const [disponibilidade, aulasReservadas, pacote] = await Promise.all([
        repos.disponibilidade.listarEntre(inicio, new Date(inicio.getTime() + MS_POR_HORA)),
        repos.aulas.listarEntre(inicio, new Date(inicio.getTime() + MS_POR_HORA)),
        pacoteDoAluno(alunoId),
      ]);

      // Valida R1 a R5 no retrato lido: no caso comum, dá o erro certo antes de gravar.
      const { aula } = reservarAula(
        {
          id: dep.gerarId(),
          alunoId,
          inicio,
          disponibilidade,
          aulasReservadas,
          pacote,
          agora: dep.agora(),
        },
        { duracaoAulaMinutos: dep.duracaoAulaMinutos },
      );

      // O saldo devolvido é o que o armazenamento debitou, não o calculado sobre o retrato.
      return repos.emTransacao(async (tx) => {
        // R4 de novo, agora travando o horário: o instrutor pode tê-lo retirado depois da
        // leitura acima, e não pode retirá-lo enquanto esta reserva não termina.
        if (!(await tx.disponibilidade.travar(inicio))) throw new HorarioIndisponivel();
        await tx.aulas.salvar(aula);
        return { aula, pacote: await tx.pacotes.debitar(alunoId) };
      });
    },

    async aulasDoAluno(alunoId) {
      const [pacote, aulas] = await Promise.all([
        pacoteDoAluno(alunoId),
        repos.aulas.listarDoAluno(alunoId),
      ]);
      return { saldo: pacote.saldo, aulas };
    },

    async consultarAgenda(data) {
      const { de, ate } = intervaloDoDia(data);
      const aulas = await repos.aulas.listarEntre(de, ate);
      return aulas
        .filter((a) => a.status === 'reservada')
        .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
    },

    async cancelarAula(aulaId, solicitante) {
      const aula = await repos.aulas.buscarPorId(aulaId);
      if (!aula) throw new AulaNaoEncontrada();
      if (solicitante && solicitante.alunoId !== aula.alunoId) throw new AulaNaoEncontrada();

      const { aula: cancelada, creditoDevolvido } = cancelarAula(
        { aula, pacote: await pacoteDoAluno(aula.alunoId), agora: dep.agora() },
        dep.politica,
      );

      return repos.emTransacao(async (tx) => {
        // Outro cancelamento pode ter chegado depois da leitura acima: só quem de fato
        // muda o status devolve o crédito.
        if (!(await tx.aulas.cancelar(aula.id))) throw new AulaJaCancelada();
        const pacote = creditoDevolvido
          ? await tx.pacotes.creditar(aula.alunoId, 1)
          : await pacoteDoAluno(aula.alunoId, tx.pacotes);
        return { aula: cancelada, pacote, creditoDevolvido };
      });
    },
  };
}
