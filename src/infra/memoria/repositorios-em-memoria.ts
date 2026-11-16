import { HorarioOcupado, SaldoInsuficiente } from '../../domain/erros.js';
import type {
  AlunoRepository,
  Armazenamento,
  AulaRepository,
  DisponibilidadeRepository,
  PacoteRepository,
  Repositorios,
} from '../../domain/repositorios.js';
import type { Aluno, Aula, Pacote } from '../../domain/tipos.js';

/**
 * Implementações em memória das portas de persistência: os dados somem ao reiniciar.
 * Cumprem o mesmo contrato da versão Prisma (`tests/infra/contrato-de-repositorios.ts`).
 *
 * Os métodos checam e gravam sem `await` no meio, então cada um é atômico: o Node não
 * troca de requisição dentro de um trecho síncrono.
 */
class AlunoEmMemoria implements AlunoRepository {
  private readonly porId = new Map<string, Aluno>();

  async salvar(aluno: Aluno): Promise<void> {
    this.porId.set(aluno.id, aluno);
  }

  async buscarPorId(id: string): Promise<Aluno | undefined> {
    return this.porId.get(id);
  }
}

class PacoteEmMemoria implements PacoteRepository {
  private porAluno = new Map<string, Pacote>();

  async creditar(alunoId: string, quantidade: number): Promise<Pacote> {
    const pacote = { alunoId, saldo: (this.porAluno.get(alunoId)?.saldo ?? 0) + quantidade };
    this.porAluno.set(alunoId, pacote);
    return pacote;
  }

  async debitar(alunoId: string): Promise<Pacote> {
    const atual = this.porAluno.get(alunoId);
    if (!atual || atual.saldo < 1) throw new SaldoInsuficiente();
    const pacote = { alunoId, saldo: atual.saldo - 1 };
    this.porAluno.set(alunoId, pacote);
    return pacote;
  }

  async buscarPorAluno(alunoId: string): Promise<Pacote | undefined> {
    return this.porAluno.get(alunoId);
  }

  /** Copia o estado e devolve a função que o restaura (o "rollback" da transação). */
  retrato(): () => void {
    const copia = new Map(this.porAluno);
    return () => {
      this.porAluno = copia;
    };
  }
}

class DisponibilidadeEmMemoria implements DisponibilidadeRepository {
  /** Instantes em ms: o Set descarta duplicados. */
  private readonly inicios = new Set<number>();

  async publicar(inicios: readonly Date[]): Promise<void> {
    for (const inicio of inicios) this.inicios.add(inicio.getTime());
  }

  async listarEntre(de: Date, ate: Date): Promise<Date[]> {
    return [...this.inicios]
      .filter((ms) => ms >= de.getTime() && ms < ate.getTime())
      .map((ms) => new Date(ms));
  }
}

class AulaEmMemoria implements AulaRepository {
  private porId = new Map<string, Aula>();

  async salvar(aula: Aula): Promise<void> {
    // R3 no armazenamento, como o índice único parcial do Postgres.
    const conflito = [...this.porId.values()].some(
      (a) =>
        a.id !== aula.id &&
        a.status === 'reservada' &&
        aula.status === 'reservada' &&
        a.inicio.getTime() === aula.inicio.getTime(),
    );
    if (conflito) throw new HorarioOcupado();
    this.porId.set(aula.id, aula);
  }

  async cancelar(id: string): Promise<boolean> {
    const aula = this.porId.get(id);
    if (aula?.status !== 'reservada') return false;
    this.porId.set(id, { ...aula, status: 'cancelada' });
    return true;
  }

  async buscarPorId(id: string): Promise<Aula | undefined> {
    return this.porId.get(id);
  }

  async listarEntre(de: Date, ate: Date): Promise<Aula[]> {
    return [...this.porId.values()].filter(
      (a) => a.inicio.getTime() >= de.getTime() && a.inicio.getTime() < ate.getTime(),
    );
  }

  retrato(): () => void {
    const copia = new Map(this.porId);
    return () => {
      this.porId = copia;
    };
  }
}

export function criarRepositoriosEmMemoria(): Armazenamento {
  const pacotes = new PacoteEmMemoria();
  const aulas = new AulaEmMemoria();
  const repos: Repositorios = {
    alunos: new AlunoEmMemoria(),
    pacotes,
    disponibilidade: new DisponibilidadeEmMemoria(),
    aulas,
  };

  // Uma transação por vez: cada uma espera a anterior terminar. Assim o retrato tirado no
  // início não apaga, ao ser restaurado, o que outra transação gravou no meio.
  // Limites: só pacotes e aulas são desfeitos (é o que as transações gravam hoje), e uma
  // gravação feita fora de transação enquanto outra está aberta se perde se ela falhar.
  let fila: Promise<unknown> = Promise.resolve();

  return {
    ...repos,
    emTransacao<T>(trabalho: (repos: Repositorios) => Promise<T>): Promise<T> {
      const execucao = fila.then(async () => {
        const desfazer = [pacotes.retrato(), aulas.retrato()];
        try {
          return await trabalho(repos);
        } catch (erro) {
          for (const restaurar of desfazer) restaurar();
          throw erro;
        }
      });
      fila = execucao.catch(() => undefined);
      return execucao;
    },
  };
}
