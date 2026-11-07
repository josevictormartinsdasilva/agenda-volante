import { cancelarAula, reservarAula } from '../domain/agenda.js';
import { AlunoNaoEncontrado, AulaNaoEncontrada, HorarioForaDaGrade } from '../domain/erros.js';
import { ehHoraCheia, intervaloDoDia } from '../domain/horario.js';
import { horariosLivres } from '../domain/horarios-livres.js';
import type { PoliticaDeCancelamento } from '../domain/politica-cancelamento.js';
import type { Repositorios } from '../domain/repositorios.js';
import type { Aluno, Aula, Pacote } from '../domain/tipos.js';

const MS_POR_HORA = 3_600_000;

export interface Dependencias {
  repositorios: Repositorios;
  duracaoAulaMinutos: number;
  politica: PoliticaDeCancelamento;
  /** Relógio e gerador de id injetados: os testes controlam o tempo e os ids. */
  agora: () => Date;
  gerarId: () => string;
}

export interface CasosDeUso {
  cadastrarAluno(dados: { nome: string }): Promise<Aluno>;
  registrarPacote(alunoId: string, quantidade: number): Promise<Pacote>;
  publicarDisponibilidade(inicios: readonly Date[]): Promise<void>;
  consultarHorariosLivres(data: string): Promise<Date[]>;
  reservarAula(alunoId: string, inicio: Date): Promise<{ aula: Aula; pacote: Pacote }>;
  consultarAgenda(data: string): Promise<Aula[]>;
  cancelarAula(
    aulaId: string,
  ): Promise<{ aula: Aula; pacote: Pacote; creditoDevolvido: boolean }>;
}

/**
 * Orquestra o fluxo principal: busca os dados nos repositórios, chama as funções
 * puras do domínio e persiste o resultado. As regras ficam no domínio, não aqui.
 *
 * Ler, validar e gravar são passos separados, então duas reservas simultâneas podem
 * passar juntas pela checagem. Quem decide é `aulas.salvar`, que recusa o segundo
 * horário (R3), e a aula é gravada antes do pacote: a reserva perdedora não gasta crédito.
 */
export function criarCasosDeUso(dep: Dependencias): CasosDeUso {
  const { repositorios: repos } = dep;

  async function exigirAluno(alunoId: string): Promise<Aluno> {
    const aluno = await repos.alunos.buscarPorId(alunoId);
    if (!aluno) throw new AlunoNaoEncontrado();
    return aluno;
  }

  async function pacoteDoAluno(alunoId: string): Promise<Pacote> {
    return (await repos.pacotes.buscarPorAluno(alunoId)) ?? { alunoId, saldo: 0 };
  }

  return {
    async cadastrarAluno({ nome }) {
      const aluno: Aluno = { id: dep.gerarId(), nome };
      await repos.alunos.salvar(aluno);
      return aluno;
    },

    async registrarPacote(alunoId, quantidade) {
      await exigirAluno(alunoId);
      const atual = await pacoteDoAluno(alunoId);
      const pacote: Pacote = { alunoId, saldo: atual.saldo + quantidade };
      await repos.pacotes.salvar(pacote);
      return pacote;
    },

    async publicarDisponibilidade(inicios) {
      // R1 vale já na publicação: o instrutor não publica horário fora da grade.
      if (!inicios.every(ehHoraCheia)) throw new HorarioForaDaGrade();
      await repos.disponibilidade.publicar(inicios);
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

      const resultado = reservarAula(
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

      await repos.aulas.salvar(resultado.aula);
      await repos.pacotes.salvar(resultado.pacote);
      return resultado;
    },

    async consultarAgenda(data) {
      const { de, ate } = intervaloDoDia(data);
      const aulas = await repos.aulas.listarEntre(de, ate);
      return aulas
        .filter((a) => a.status === 'reservada')
        .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
    },

    async cancelarAula(aulaId) {
      const aula = await repos.aulas.buscarPorId(aulaId);
      if (!aula) throw new AulaNaoEncontrada();

      const resultado = cancelarAula(
        { aula, pacote: await pacoteDoAluno(aula.alunoId), agora: dep.agora() },
        dep.politica,
      );

      await repos.aulas.salvar(resultado.aula);
      await repos.pacotes.salvar(resultado.pacote);
      return resultado;
    },
  };
}
