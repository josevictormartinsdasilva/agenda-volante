import { Prisma, type PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { HorarioOcupado } from '../../src/domain/erros.js';
import { criarRepositoriosPrisma } from '../../src/infra/prisma/repositorios-prisma.js';

/**
 * Testa só o que o adaptador faz sozinho (traduzir resultados e erros) com um client
 * falso. O comportamento do SQL e do índice único é coberto pelo contrato em
 * repositorios-prisma.test.ts, que roda contra o Postgres do CI.
 */
const H10 = new Date('2026-11-20T13:00:00.000Z');
const H11 = new Date('2026-11-20T14:00:00.000Z');
const AULA = { id: 'a1', alunoId: 'ana', inicio: H10, fim: new Date('2026-11-20T13:50:00.000Z'), status: 'reservada' } as const;

function criarDbFalso() {
  const db = {
    aluno: { upsert: vi.fn(), findUnique: vi.fn() },
    pacote: { upsert: vi.fn(), findUnique: vi.fn() },
    disponibilidade: { createMany: vi.fn(), findMany: vi.fn() },
    aula: { upsert: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  };
  return { db, repos: criarRepositoriosPrisma(db as unknown as PrismaClient) };
}

function erroPrisma(code: string) {
  return new Prisma.PrismaClientKnownRequestError('falha', { code, clientVersion: 'teste' });
}

describe('adaptador Prisma', () => {
  it('traduz a violação do índice único (P2002) em HorarioOcupado', async () => {
    const { db, repos } = criarDbFalso();
    db.aula.upsert.mockRejectedValue(erroPrisma('P2002'));

    await expect(repos.aulas.salvar(AULA)).rejects.toBeInstanceOf(HorarioOcupado);
  });

  it('repassa qualquer outro erro sem disfarçá-lo de horário ocupado', async () => {
    const { db, repos } = criarDbFalso();
    const falha = erroPrisma('P2025');
    db.aula.upsert.mockRejectedValue(falha);

    await expect(repos.aulas.salvar(AULA)).rejects.toBe(falha);
  });

  it('grava a aula pelo id: cria com todos os campos e atualiza sem o id', async () => {
    const { db, repos } = criarDbFalso();

    await repos.aulas.salvar(AULA);

    const { id, ...semId } = AULA;
    expect(db.aula.upsert).toHaveBeenCalledWith({ where: { id }, create: AULA, update: semId });
  });

  it('devolve undefined quando a linha não existe e o registro quando existe', async () => {
    const { db, repos } = criarDbFalso();
    db.aluno.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'ana', nome: 'Ana' });
    db.pacote.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ alunoId: 'ana', saldo: 3 });
    db.aula.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(AULA);

    expect(await repos.alunos.buscarPorId('ana')).toBeUndefined();
    expect(await repos.alunos.buscarPorId('ana')).toEqual({ id: 'ana', nome: 'Ana' });
    expect(await repos.pacotes.buscarPorAluno('ana')).toBeUndefined();
    expect(await repos.pacotes.buscarPorAluno('ana')).toEqual({ alunoId: 'ana', saldo: 3 });
    expect(await repos.aulas.buscarPorId('a1')).toBeUndefined();
    expect(await repos.aulas.buscarPorId('a1')).toEqual(AULA);
  });

  it('aluno e pacote usam upsert, então salvar de novo atualiza', async () => {
    const { db, repos } = criarDbFalso();

    await repos.alunos.salvar({ id: 'ana', nome: 'Ana' });
    await repos.pacotes.salvar({ alunoId: 'ana', saldo: 4 });

    expect(db.aluno.upsert).toHaveBeenCalledWith({
      where: { id: 'ana' },
      create: { id: 'ana', nome: 'Ana' },
      update: { nome: 'Ana' },
    });
    expect(db.pacote.upsert).toHaveBeenCalledWith({
      where: { alunoId: 'ana' },
      create: { alunoId: 'ana', saldo: 4 },
      update: { saldo: 4 },
    });
  });

  it('disponibilidade: publica ignorando duplicados e lista como datas em [de, ate)', async () => {
    const { db, repos } = criarDbFalso();
    db.disponibilidade.findMany.mockResolvedValue([{ inicio: H10 }, { inicio: H11 }]);

    await repos.disponibilidade.publicar([H10, H11]);
    const lista = await repos.disponibilidade.listarEntre(H10, new Date('2026-11-21T03:00:00.000Z'));

    expect(db.disponibilidade.createMany).toHaveBeenCalledWith({
      data: [{ inicio: H10 }, { inicio: H11 }],
      skipDuplicates: true,
    });
    expect(db.disponibilidade.findMany).toHaveBeenCalledWith({
      where: { inicio: { gte: H10, lt: new Date('2026-11-21T03:00:00.000Z') } },
      orderBy: { inicio: 'asc' },
    });
    expect(lista).toEqual([H10, H11]);
  });

  it('aulas: lista as que começam em [de, ate) em ordem de início', async () => {
    const { db, repos } = criarDbFalso();
    db.aula.findMany.mockResolvedValue([AULA]);

    const lista = await repos.aulas.listarEntre(H10, H11);

    expect(db.aula.findMany).toHaveBeenCalledWith({
      where: { inicio: { gte: H10, lt: H11 } },
      orderBy: { inicio: 'asc' },
    });
    expect(lista).toEqual([AULA]);
  });
});
