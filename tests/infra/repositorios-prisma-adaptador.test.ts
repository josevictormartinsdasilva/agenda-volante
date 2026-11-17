import { Prisma, type PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { EmailJaCadastrado, HorarioOcupado, SaldoInsuficiente } from '../../src/domain/erros.js';
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
    aluno: { upsert: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    usuario: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
    sessao: { create: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
    codigoDeRedefinicao: { upsert: vi.fn(), deleteMany: vi.fn() },
    pacote: { upsert: vi.fn(), updateManyAndReturn: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    disponibilidade: { createMany: vi.fn(), findMany: vi.fn() },
    aula: { upsert: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    // Como o Prisma: chama o trabalho com o client da transação e repassa o resultado.
    $transaction: vi.fn(async (trabalho: (tx: unknown) => Promise<unknown>) => trabalho(db)),
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

  it('conta: traduz a violação do índice único do e-mail em EmailJaCadastrado e repassa o resto', async () => {
    const { db, repos } = criarDbFalso();
    const conta = { id: 'u1', email: 'ana@exemplo.com', senhaHash: 'h', papel: 'aluno', alunoId: 'ana' } as const;
    const falha = erroPrisma('P2003');
    db.usuario.create.mockRejectedValueOnce(erroPrisma('P2002')).mockRejectedValueOnce(falha);

    await expect(repos.usuarios.criar(conta)).rejects.toBeInstanceOf(EmailJaCadastrado);
    await expect(repos.usuarios.criar(conta)).rejects.toBe(falha);
    expect(db.usuario.create).toHaveBeenCalledWith({ data: conta });
  });

  it('conta e sessão: devolvem undefined quando não há linha, e consultam com o filtro certo', async () => {
    const { db, repos } = criarDbFalso();
    db.usuario.findUnique.mockResolvedValue(null);
    db.usuario.findMany.mockResolvedValue([]);
    db.sessao.findUnique.mockResolvedValue(null);
    db.aluno.findMany.mockResolvedValue([{ id: 'ana', nome: 'Ana' }]);

    expect(await repos.usuarios.buscarPorEmail('x@exemplo.com')).toBeUndefined();
    expect(await repos.usuarios.listarPorPapel('aluno')).toEqual([]);
    expect(await repos.sessoes.buscar('resumo')).toBeUndefined();
    expect(await repos.alunos.listar()).toEqual([{ id: 'ana', nome: 'Ana' }]);

    expect(db.usuario.findUnique).toHaveBeenCalledWith({ where: { email: 'x@exemplo.com' } });
    expect(db.usuario.findMany).toHaveBeenCalledWith({ where: { papel: 'aluno' }, orderBy: { email: 'asc' } });
    expect(db.sessao.findUnique).toHaveBeenCalledWith({ where: { tokenHash: 'resumo' } });
    expect(db.aluno.findMany).toHaveBeenCalledWith({ orderBy: { nome: 'asc' } });
  });

  it('sessão: grava a linha e remove com deleteMany, que não lança se ela já não existe', async () => {
    const { db, repos } = criarDbFalso();
    const sessao = { tokenHash: 'resumo', usuarioId: 'u1', papel: 'aluno', alunoId: 'ana', expiraEm: H10 } as const;

    await repos.sessoes.salvar(sessao);
    await repos.sessoes.remover('resumo');

    expect(db.sessao.create).toHaveBeenCalledWith({ data: sessao });
    expect(db.sessao.deleteMany).toHaveBeenCalledWith({ where: { tokenHash: 'resumo' } });
  });

  it('sessão: remove as expiradas com um deleteMany por data e devolve a contagem', async () => {
    const { db, repos } = criarDbFalso();
    db.sessao.deleteMany.mockResolvedValue({ count: 3 });

    expect(await repos.sessoes.removerExpiradas(H10)).toBe(3);
    expect(db.sessao.deleteMany).toHaveBeenCalledWith({ where: { expiraEm: { lte: H10 } } });
  });

  it('conta: busca por id e por aluno (undefined sem linha), troca a senha e remove', async () => {
    const { db, repos } = criarDbFalso();
    db.usuario.findUnique.mockResolvedValue(null);

    expect(await repos.usuarios.buscarPorId('u1')).toBeUndefined();
    expect(await repos.usuarios.buscarPorAluno('ana')).toBeUndefined();
    await repos.usuarios.trocarSenha('u1', 'hash-novo');
    await repos.usuarios.remover('u1');

    expect(db.usuario.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' } });
    expect(db.usuario.findUnique).toHaveBeenCalledWith({ where: { alunoId: 'ana' } });
    expect(db.usuario.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { senhaHash: 'hash-novo' } });
    expect(db.usuario.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
  });

  it('sessão: remove as do usuário, com ou sem uma sessão poupada', async () => {
    const { db, repos } = criarDbFalso();
    db.sessao.deleteMany.mockResolvedValue({ count: 2 });

    expect(await repos.sessoes.removerDoUsuario('u1', 'poupar')).toBe(2);
    await repos.sessoes.removerDoUsuario('u1');

    expect(db.sessao.deleteMany).toHaveBeenCalledWith({
      where: { usuarioId: 'u1', tokenHash: { not: 'poupar' } },
    });
    expect(db.sessao.deleteMany).toHaveBeenCalledWith({ where: { usuarioId: 'u1' } });
  });

  it('código: salva por usuário e consome com um DELETE condicionado ao código e à validade', async () => {
    const { db, repos } = criarDbFalso();
    const codigo = { usuarioId: 'u1', codigoHash: 'h', expiraEm: H11 };
    db.codigoDeRedefinicao.deleteMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });

    await repos.codigos.salvar(codigo);
    expect(await repos.codigos.consumir('u1', 'h', H10)).toBe(true);
    expect(await repos.codigos.consumir('u1', 'h', H10)).toBe(false);
    await repos.codigos.remover('u1');

    expect(db.codigoDeRedefinicao.upsert).toHaveBeenCalledWith({
      where: { usuarioId: 'u1' },
      create: codigo,
      update: { codigoHash: 'h', expiraEm: H11 },
    });
    expect(db.codigoDeRedefinicao.deleteMany).toHaveBeenCalledWith({
      where: { usuarioId: 'u1', codigoHash: 'h', expiraEm: { gt: H10 } },
    });
    expect(db.codigoDeRedefinicao.deleteMany).toHaveBeenLastCalledWith({ where: { usuarioId: 'u1' } });
  });

  it('aulas do aluno: filtra pelo aluno e ordena pelo início', async () => {
    const { db, repos } = criarDbFalso();
    db.aula.findMany.mockResolvedValue([AULA]);

    expect(await repos.aulas.listarDoAluno('ana')).toEqual([AULA]);
    expect(db.aula.findMany).toHaveBeenCalledWith({ where: { alunoId: 'ana' }, orderBy: { inicio: 'asc' } });
  });

  it('pacotes: lista todos', async () => {
    const { db, repos } = criarDbFalso();
    db.pacote.findMany.mockResolvedValue([{ alunoId: 'ana', saldo: 2 }]);

    expect(await repos.pacotes.listar()).toEqual([{ alunoId: 'ana', saldo: 2 }]);
    expect(db.pacote.findMany).toHaveBeenCalledWith();
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

  it('aluno usa upsert, então salvar de novo atualiza', async () => {
    const { db, repos } = criarDbFalso();

    await repos.alunos.salvar({ id: 'ana', nome: 'Ana' });

    expect(db.aluno.upsert).toHaveBeenCalledWith({
      where: { id: 'ana' },
      create: { id: 'ana', nome: 'Ana' },
      update: { nome: 'Ana' },
    });
  });

  it('creditar deixa a soma para o banco (increment), sem ler o saldo antes', async () => {
    const { db, repos } = criarDbFalso();
    db.pacote.upsert.mockResolvedValue({ alunoId: 'ana', saldo: 7 });

    expect(await repos.pacotes.creditar('ana', 4)).toEqual({ alunoId: 'ana', saldo: 7 });

    expect(db.pacote.upsert).toHaveBeenCalledWith({
      where: { alunoId: 'ana' },
      create: { alunoId: 'ana', saldo: 4 },
      update: { saldo: { increment: 4 } },
    });
    expect(db.pacote.findUnique).not.toHaveBeenCalled();
  });

  it('debitar condiciona o decremento a saldo >= 1 na mesma instrução', async () => {
    const { db, repos } = criarDbFalso();
    db.pacote.updateManyAndReturn.mockResolvedValue([{ alunoId: 'ana', saldo: 2 }]);

    expect(await repos.pacotes.debitar('ana')).toEqual({ alunoId: 'ana', saldo: 2 });

    expect(db.pacote.updateManyAndReturn).toHaveBeenCalledWith({
      where: { alunoId: 'ana', saldo: { gte: 1 } },
      data: { saldo: { decrement: 1 } },
    });
  });

  it('debitar lança SaldoInsuficiente quando nenhuma linha foi atualizada (R5)', async () => {
    const { db, repos } = criarDbFalso();
    db.pacote.updateManyAndReturn.mockResolvedValue([]);

    await expect(repos.pacotes.debitar('ana')).rejects.toBeInstanceOf(SaldoInsuficiente);
  });

  it('cancelar só atinge a aula ainda reservada e diz se mudou alguma linha', async () => {
    const { db, repos } = criarDbFalso();
    db.aula.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    expect(await repos.aulas.cancelar('a1')).toBe(true);
    expect(await repos.aulas.cancelar('a1')).toBe(false);

    expect(db.aula.updateMany).toHaveBeenCalledWith({
      where: { id: 'a1', status: 'reservada' },
      data: { status: 'cancelada' },
    });
  });

  it('emTransacao roda o trabalho dentro de $transaction e devolve o resultado dele', async () => {
    const { db, repos } = criarDbFalso();
    db.aula.updateMany.mockResolvedValue({ count: 1 });

    const resultado = await repos.emTransacao((tx) => tx.aulas.cancelar('a1'));

    expect(resultado).toBe(true);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('emTransacao repassa o erro do trabalho, para o Prisma desfazer a transação', async () => {
    const { repos } = criarDbFalso();
    const falha = new Error('falha no meio');

    await expect(repos.emTransacao(() => Promise.reject(falha))).rejects.toBe(falha);
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
