import { Prisma, type PrismaClient } from '@prisma/client';
import { HorarioOcupado } from '../../domain/erros.js';
import type {
  AlunoRepository,
  AulaRepository,
  DisponibilidadeRepository,
  PacoteRepository,
  Repositorios,
} from '../../domain/repositorios.js';
import type { Aluno, Aula, Pacote } from '../../domain/tipos.js';

/** Violação de índice único (no nosso caso, o parcial de R3 em Aula.inicio). */
const VIOLACAO_DE_UNICIDADE = 'P2002';

class AlunoPrisma implements AlunoRepository {
  constructor(private readonly db: PrismaClient) {}

  async salvar(aluno: Aluno): Promise<void> {
    await this.db.aluno.upsert({
      where: { id: aluno.id },
      create: { id: aluno.id, nome: aluno.nome },
      update: { nome: aluno.nome },
    });
  }

  async buscarPorId(id: string): Promise<Aluno | undefined> {
    const aluno = await this.db.aluno.findUnique({ where: { id } });
    return aluno ?? undefined;
  }
}

class PacotePrisma implements PacoteRepository {
  constructor(private readonly db: PrismaClient) {}

  async salvar(pacote: Pacote): Promise<void> {
    await this.db.pacote.upsert({
      where: { alunoId: pacote.alunoId },
      create: { alunoId: pacote.alunoId, saldo: pacote.saldo },
      update: { saldo: pacote.saldo },
    });
  }

  async buscarPorAluno(alunoId: string): Promise<Pacote | undefined> {
    const pacote = await this.db.pacote.findUnique({ where: { alunoId } });
    return pacote ?? undefined;
  }
}

class DisponibilidadePrisma implements DisponibilidadeRepository {
  constructor(private readonly db: PrismaClient) {}

  async publicar(inicios: readonly Date[]): Promise<void> {
    await this.db.disponibilidade.createMany({
      data: inicios.map((inicio) => ({ inicio })),
      skipDuplicates: true,
    });
  }

  async listarEntre(de: Date, ate: Date): Promise<Date[]> {
    const linhas = await this.db.disponibilidade.findMany({
      where: { inicio: { gte: de, lt: ate } },
      orderBy: { inicio: 'asc' },
    });
    return linhas.map((linha) => linha.inicio);
  }
}

class AulaPrisma implements AulaRepository {
  constructor(private readonly db: PrismaClient) {}

  async salvar(aula: Aula): Promise<void> {
    const { id, ...dados } = aula;
    try {
      await this.db.aula.upsert({ where: { id }, create: aula, update: dados });
    } catch (erro) {
      if (
        erro instanceof Prisma.PrismaClientKnownRequestError &&
        erro.code === VIOLACAO_DE_UNICIDADE
      ) {
        throw new HorarioOcupado();
      }
      throw erro;
    }
  }

  async buscarPorId(id: string): Promise<Aula | undefined> {
    const aula = await this.db.aula.findUnique({ where: { id } });
    return aula ?? undefined;
  }

  async listarEntre(de: Date, ate: Date): Promise<Aula[]> {
    return this.db.aula.findMany({
      where: { inicio: { gte: de, lt: ate } },
      orderBy: { inicio: 'asc' },
    });
  }
}

export function criarRepositoriosPrisma(db: PrismaClient): Repositorios {
  return {
    alunos: new AlunoPrisma(db),
    pacotes: new PacotePrisma(db),
    disponibilidade: new DisponibilidadePrisma(db),
    aulas: new AulaPrisma(db),
  };
}
