import { Prisma, type PrismaClient } from '@prisma/client';
import { EmailJaCadastrado, HorarioOcupado, SaldoInsuficiente } from '../../domain/erros.js';
import type {
  AlunoRepository,
  Armazenamento,
  AulaRepository,
  DisponibilidadeRepository,
  PacoteRepository,
  Repositorios,
  SessaoRepository,
  UsuarioRepository,
} from '../../domain/repositorios.js';
import type { Aluno, Aula, Pacote, Papel, Sessao, Usuario } from '../../domain/tipos.js';

/** Violação de índice único: o parcial de R3 em Aula.inicio ou o do e-mail em Usuario. */
const VIOLACAO_DE_UNICIDADE = 'P2002';

function ehViolacaoDeUnicidade(erro: unknown): boolean {
  return (
    erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === VIOLACAO_DE_UNICIDADE
  );
}

/**
 * O que os repositórios usam do Prisma: o client normal ou o de dentro de uma transação.
 * Os dois têm os mesmos modelos; o `PrismaClient` só acrescenta `$transaction` e afins.
 */
type Db = Prisma.TransactionClient;

class AlunoPrisma implements AlunoRepository {
  constructor(private readonly db: Db) {}

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

  async listar(): Promise<Aluno[]> {
    return this.db.aluno.findMany({ orderBy: { nome: 'asc' } });
  }
}

class UsuarioPrisma implements UsuarioRepository {
  constructor(private readonly db: Db) {}

  async criar(usuario: Usuario): Promise<void> {
    try {
      await this.db.usuario.create({ data: usuario });
    } catch (erro) {
      // O índice único do e-mail decide: de dois cadastros simultâneos, um cai aqui.
      if (ehViolacaoDeUnicidade(erro)) throw new EmailJaCadastrado();
      throw erro;
    }
  }

  async buscarPorEmail(email: string): Promise<Usuario | undefined> {
    const usuario = await this.db.usuario.findUnique({ where: { email } });
    return usuario ?? undefined;
  }

  async listarPorPapel(papel: Papel): Promise<Usuario[]> {
    return this.db.usuario.findMany({ where: { papel }, orderBy: { email: 'asc' } });
  }
}

class SessaoPrisma implements SessaoRepository {
  constructor(private readonly db: Db) {}

  async salvar(sessao: Sessao): Promise<void> {
    await this.db.sessao.create({ data: sessao });
  }

  async buscar(tokenHash: string): Promise<Sessao | undefined> {
    const sessao = await this.db.sessao.findUnique({ where: { tokenHash } });
    return sessao ?? undefined;
  }

  async remover(tokenHash: string): Promise<void> {
    // `deleteMany` não lança quando a sessão já não existe (logout repetido).
    await this.db.sessao.deleteMany({ where: { tokenHash } });
  }
}

class PacotePrisma implements PacoteRepository {
  constructor(private readonly db: Db) {}

  async creditar(alunoId: string, quantidade: number): Promise<Pacote> {
    // `increment` vira `saldo = saldo + n` no SQL: a soma é feita pelo banco, não aqui.
    return this.db.pacote.upsert({
      where: { alunoId },
      create: { alunoId, saldo: quantidade },
      update: { saldo: { increment: quantidade } },
    });
  }

  async debitar(alunoId: string): Promise<Pacote> {
    // Um único `UPDATE ... WHERE saldo >= 1 RETURNING`: checar e debitar são atômicos.
    // De dois débitos simultâneos do último crédito, o segundo espera o primeiro,
    // reavalia o WHERE e não encontra linha.
    const [pacote] = await this.db.pacote.updateManyAndReturn({
      where: { alunoId, saldo: { gte: 1 } },
      data: { saldo: { decrement: 1 } },
    });
    if (!pacote) throw new SaldoInsuficiente();
    return pacote;
  }

  async buscarPorAluno(alunoId: string): Promise<Pacote | undefined> {
    const pacote = await this.db.pacote.findUnique({ where: { alunoId } });
    return pacote ?? undefined;
  }
}

class DisponibilidadePrisma implements DisponibilidadeRepository {
  constructor(private readonly db: Db) {}

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
  constructor(private readonly db: Db) {}

  async salvar(aula: Aula): Promise<void> {
    const { id, ...dados } = aula;
    try {
      await this.db.aula.upsert({ where: { id }, create: aula, update: dados });
    } catch (erro) {
      if (ehViolacaoDeUnicidade(erro)) throw new HorarioOcupado();
      throw erro;
    }
  }

  async cancelar(id: string): Promise<boolean> {
    // O `status: 'reservada'` no WHERE é o que impede o cancelamento em dobro.
    const { count } = await this.db.aula.updateMany({
      where: { id, status: 'reservada' },
      data: { status: 'cancelada' },
    });
    return count === 1;
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

function montar(db: Db): Repositorios {
  return {
    alunos: new AlunoPrisma(db),
    usuarios: new UsuarioPrisma(db),
    sessoes: new SessaoPrisma(db),
    pacotes: new PacotePrisma(db),
    disponibilidade: new DisponibilidadePrisma(db),
    aulas: new AulaPrisma(db),
  };
}

export function criarRepositoriosPrisma(db: PrismaClient): Armazenamento {
  return {
    ...montar(db),
    // Transação interativa do Prisma: `trabalho` recebe repositórios ligados a ela;
    // se ele lançar, o Prisma faz ROLLBACK e nada do que gravou permanece.
    emTransacao: (trabalho) => db.$transaction((tx) => trabalho(montar(tx))),
  };
}
