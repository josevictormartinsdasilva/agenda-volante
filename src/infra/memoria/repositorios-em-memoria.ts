import { HorarioOcupado } from '../../domain/erros.js';
import type {
  AlunoRepository,
  AulaRepository,
  DisponibilidadeRepository,
  PacoteRepository,
  Repositorios,
} from '../../domain/repositorios.js';
import type { Aluno, Aula, Pacote } from '../../domain/tipos.js';

/**
 * Implementações em memória das portas de persistência: os dados somem ao reiniciar.
 * O gancho para o banco real é este mesmo contrato (`Repositorios`): uma versão
 * Prisma o implementa e só a composição em `server.ts` muda.
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
  private readonly porAluno = new Map<string, Pacote>();

  async salvar(pacote: Pacote): Promise<void> {
    this.porAluno.set(pacote.alunoId, pacote);
  }

  async buscarPorAluno(alunoId: string): Promise<Pacote | undefined> {
    return this.porAluno.get(alunoId);
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
  private readonly porId = new Map<string, Aula>();

  async salvar(aula: Aula): Promise<void> {
    // R3 no armazenamento, como o índice único parcial do Postgres. Não há `await`
    // entre checar e gravar, então duas reservas simultâneas não passam juntas.
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

  async buscarPorId(id: string): Promise<Aula | undefined> {
    return this.porId.get(id);
  }

  async listarEntre(de: Date, ate: Date): Promise<Aula[]> {
    return [...this.porId.values()].filter(
      (a) => a.inicio.getTime() >= de.getTime() && a.inicio.getTime() < ate.getTime(),
    );
  }
}

export function criarRepositoriosEmMemoria(): Repositorios {
  return {
    alunos: new AlunoEmMemoria(),
    pacotes: new PacoteEmMemoria(),
    disponibilidade: new DisponibilidadeEmMemoria(),
    aulas: new AulaEmMemoria(),
  };
}
