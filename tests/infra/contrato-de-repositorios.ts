import { beforeEach, describe, expect, it } from 'vitest';
import {
  EmailJaCadastrado,
  HorarioOcupado,
  SaldoInsuficiente,
} from '../../src/domain/erros.js';
import type { Armazenamento } from '../../src/domain/repositorios.js';
import type { Aula, Usuario } from '../../src/domain/tipos.js';

const H10 = new Date('2026-11-20T13:00:00.000Z');
const H11 = new Date('2026-11-20T14:00:00.000Z');
const H12 = new Date('2026-11-20T15:00:00.000Z');

const CONTA_DA_ANA: Usuario = {
  id: 'u-ana',
  email: 'ana@exemplo.com',
  senhaHash: 'hash-qualquer',
  papel: 'aluno',
  alunoId: 'ana',
};
const CONTA_DO_INSTRUTOR: Usuario = {
  id: 'u-instrutor',
  email: 'instrutor@exemplo.com',
  senhaHash: 'outro-hash',
  papel: 'instrutor',
  alunoId: null,
};

function aula(id: string, inicio: Date, status: Aula['status'] = 'reservada'): Aula {
  return { id, alunoId: 'ana', inicio, fim: new Date(inicio.getTime() + 50 * 60_000), status };
}

/**
 * Contrato que toda implementação de `Repositorios` precisa cumprir. Roda contra a
 * versão em memória (sempre) e contra o Postgres (quando há banco de teste), então
 * trocar uma pela outra não muda o comportamento que os casos de uso enxergam.
 */
export function contratoDeRepositorios(
  nome: string,
  criar: () => Promise<Armazenamento>,
  opcoes: { pular?: boolean } = {},
): void {
  describe.skipIf(opcoes.pular)(`contrato dos repositórios: ${nome}`, () => {
    let repos: Armazenamento;

    beforeEach(async () => {
      repos = await criar();
      await repos.alunos.salvar({ id: 'ana', nome: 'Ana' });
    });

    it('aluno: guarda e busca por id; id desconhecido devolve undefined', async () => {
      expect(await repos.alunos.buscarPorId('ana')).toEqual({ id: 'ana', nome: 'Ana' });
      expect(await repos.alunos.buscarPorId('fantasma')).toBeUndefined();
    });

    it('aluno: lista todos em ordem de nome', async () => {
      await repos.alunos.salvar({ id: 'zeca', nome: 'Zeca' });
      await repos.alunos.salvar({ id: 'bia', nome: 'Bia' });

      expect((await repos.alunos.listar()).map((a) => a.nome)).toEqual(['Ana', 'Bia', 'Zeca']);
    });

    it('usuário: guarda, busca por e-mail e lista por papel', async () => {
      await repos.usuarios.criar(CONTA_DA_ANA);
      await repos.usuarios.criar(CONTA_DO_INSTRUTOR);

      expect(await repos.usuarios.buscarPorEmail('ana@exemplo.com')).toEqual(CONTA_DA_ANA);
      expect(await repos.usuarios.buscarPorEmail('ninguem@exemplo.com')).toBeUndefined();
      expect(await repos.usuarios.listarPorPapel('aluno')).toEqual([CONTA_DA_ANA]);
      expect(await repos.usuarios.listarPorPapel('instrutor')).toEqual([CONTA_DO_INSTRUTOR]);
    });

    it('usuário: recusa um segundo cadastro com o mesmo e-mail', async () => {
      await repos.usuarios.criar(CONTA_DO_INSTRUTOR);

      await expect(
        repos.usuarios.criar({ ...CONTA_DO_INSTRUTOR, id: 'u-outro' }),
      ).rejects.toBeInstanceOf(EmailJaCadastrado);
    });

    it('usuário: de dois cadastros simultâneos com o mesmo e-mail, só um passa', async () => {
      const resultados = await Promise.allSettled([
        repos.usuarios.criar(CONTA_DO_INSTRUTOR),
        repos.usuarios.criar({ ...CONTA_DO_INSTRUTOR, id: 'u-outro' }),
      ]);

      expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(await repos.usuarios.listarPorPapel('instrutor')).toHaveLength(1);
    });

    it('transação: conta com e-mail repetido desfaz o aluno gravado junto', async () => {
      await repos.usuarios.criar(CONTA_DA_ANA);

      await expect(
        repos.emTransacao(async (tx) => {
          await tx.alunos.salvar({ id: 'clone', nome: 'Clone' });
          await tx.usuarios.criar({ ...CONTA_DA_ANA, id: 'u-clone', alunoId: 'clone' });
        }),
      ).rejects.toBeInstanceOf(EmailJaCadastrado);

      expect(await repos.alunos.buscarPorId('clone')).toBeUndefined();
    });

    it('sessão: guarda, busca pelo resumo do token e remove (remover de novo não é erro)', async () => {
      await repos.usuarios.criar(CONTA_DA_ANA);
      const sessao = {
        tokenHash: 'resumo-1',
        usuarioId: 'u-ana',
        papel: 'aluno' as const,
        alunoId: 'ana',
        expiraEm: new Date('2026-11-27T12:00:00.000Z'),
      };

      await repos.sessoes.salvar(sessao);
      expect(await repos.sessoes.buscar('resumo-1')).toEqual(sessao);
      expect(await repos.sessoes.buscar('outro-resumo')).toBeUndefined();

      await repos.sessoes.remover('resumo-1');
      await expect(repos.sessoes.remover('resumo-1')).resolves.toBeUndefined();
      expect(await repos.sessoes.buscar('resumo-1')).toBeUndefined();
    });

    it('pacote: creditar cria o pacote e depois soma ao saldo', async () => {
      expect(await repos.pacotes.buscarPorAluno('ana')).toBeUndefined();

      expect(await repos.pacotes.creditar('ana', 5)).toEqual({ alunoId: 'ana', saldo: 5 });
      expect(await repos.pacotes.creditar('ana', 2)).toEqual({ alunoId: 'ana', saldo: 7 });

      expect(await repos.pacotes.buscarPorAluno('ana')).toEqual({ alunoId: 'ana', saldo: 7 });
    });

    it('pacote: debitar consome 1 crédito e devolve o saldo novo', async () => {
      await repos.pacotes.creditar('ana', 2);

      expect(await repos.pacotes.debitar('ana')).toEqual({ alunoId: 'ana', saldo: 1 });
      expect(await repos.pacotes.buscarPorAluno('ana')).toEqual({ alunoId: 'ana', saldo: 1 });
    });

    it('R5: debitar sem pacote ou com saldo zero lança SaldoInsuficiente e não fica negativo', async () => {
      await expect(repos.pacotes.debitar('ana')).rejects.toBeInstanceOf(SaldoInsuficiente);

      await repos.pacotes.creditar('ana', 1);
      await repos.pacotes.debitar('ana');

      await expect(repos.pacotes.debitar('ana')).rejects.toBeInstanceOf(SaldoInsuficiente);
      expect(await repos.pacotes.buscarPorAluno('ana')).toEqual({ alunoId: 'ana', saldo: 0 });
    });

    it('R5: de dois débitos simultâneos do último crédito, só um passa', async () => {
      await repos.pacotes.creditar('ana', 1);

      const resultados = await Promise.allSettled([
        repos.pacotes.debitar('ana'),
        repos.pacotes.debitar('ana'),
      ]);

      const recusados = resultados.filter((r) => r.status === 'rejected');
      expect(recusados).toHaveLength(1);
      expect(recusados[0]?.reason).toBeInstanceOf(SaldoInsuficiente);
      expect(await repos.pacotes.buscarPorAluno('ana')).toEqual({ alunoId: 'ana', saldo: 0 });
    });

    it('pacote: créditos simultâneos somam todos', async () => {
      await Promise.all([repos.pacotes.creditar('ana', 4), repos.pacotes.creditar('ana', 6)]);

      expect(await repos.pacotes.buscarPorAluno('ana')).toEqual({ alunoId: 'ana', saldo: 10 });
    });

    it('disponibilidade: publicar é idempotente e a consulta é [de, ate)', async () => {
      await repos.disponibilidade.publicar([H10, H11]);
      await repos.disponibilidade.publicar([H11, H12]);

      expect(await repos.disponibilidade.listarEntre(H10, H12)).toEqual([H10, H11]);
      expect(await repos.disponibilidade.listarEntre(H11, new Date(H12.getTime() + 1))).toEqual([
        H11,
        H12,
      ]);
    });

    it('aula: guarda, busca por id e atualiza o status', async () => {
      await repos.aulas.salvar(aula('a1', H10));
      expect(await repos.aulas.buscarPorId('a1')).toEqual(aula('a1', H10));
      expect(await repos.aulas.buscarPorId('fantasma')).toBeUndefined();

      await repos.aulas.salvar(aula('a1', H10, 'cancelada'));

      expect(await repos.aulas.buscarPorId('a1')).toEqual(aula('a1', H10, 'cancelada'));
    });

    it('aula: lista reservadas e canceladas que começam em [de, ate)', async () => {
      await repos.aulas.salvar(aula('a1', H10));
      await repos.aulas.salvar(aula('a2', H11, 'cancelada'));
      await repos.aulas.salvar(aula('a3', H12));

      const lista = await repos.aulas.listarEntre(H10, H12);

      expect(lista.map((a) => a.id).sort()).toEqual(['a1', 'a2']);
    });

    it('R3: recusa uma segunda aula reservada no mesmo horário', async () => {
      await repos.aulas.salvar(aula('a1', H10));

      await expect(repos.aulas.salvar(aula('a2', H10))).rejects.toBeInstanceOf(HorarioOcupado);
      expect(await repos.aulas.buscarPorId('a2')).toBeUndefined();
    });

    it('R3: salvar a mesma aula de novo não conflita com ela mesma', async () => {
      await repos.aulas.salvar(aula('a1', H10));

      await expect(repos.aulas.salvar(aula('a1', H10))).resolves.toBeUndefined();
    });

    it('R3: cancelar libera o horário para outra reserva', async () => {
      await repos.aulas.salvar(aula('a1', H10));
      await repos.aulas.salvar(aula('a1', H10, 'cancelada'));

      await expect(repos.aulas.salvar(aula('a2', H10))).resolves.toBeUndefined();
    });

    it('aula: cancelar muda o status uma vez; a segunda tentativa devolve false', async () => {
      await repos.aulas.salvar(aula('a1', H10));

      expect(await repos.aulas.cancelar('a1')).toBe(true);
      expect(await repos.aulas.buscarPorId('a1')).toEqual(aula('a1', H10, 'cancelada'));
      expect(await repos.aulas.cancelar('a1')).toBe(false);
      expect(await repos.aulas.cancelar('fantasma')).toBe(false);
    });

    it('R6: de dois cancelamentos simultâneos da mesma aula, só um muda o status', async () => {
      await repos.aulas.salvar(aula('a1', H10));

      const mudou = await Promise.all([repos.aulas.cancelar('a1'), repos.aulas.cancelar('a1')]);

      expect(mudou.filter(Boolean)).toHaveLength(1);
    });

    it('transação: confirma tudo o que foi gravado e devolve o resultado', async () => {
      await repos.pacotes.creditar('ana', 1);

      const saldo = await repos.emTransacao(async (tx) => {
        await tx.aulas.salvar(aula('a1', H10));
        return (await tx.pacotes.debitar('ana')).saldo;
      });

      expect(saldo).toBe(0);
      expect(await repos.aulas.buscarPorId('a1')).toEqual(aula('a1', H10));
      expect(await repos.pacotes.buscarPorAluno('ana')).toEqual({ alunoId: 'ana', saldo: 0 });
    });

    it('transação: se uma gravação falha, a anterior é desfeita', async () => {
      // Aluno sem saldo: a aula é gravada e o débito falha em seguida.
      await expect(
        repos.emTransacao(async (tx) => {
          await tx.aulas.salvar(aula('a1', H10));
          await tx.pacotes.debitar('ana');
        }),
      ).rejects.toBeInstanceOf(SaldoInsuficiente);

      expect(await repos.aulas.buscarPorId('a1')).toBeUndefined();
    });

    it('transação: desfaz também o crédito quando o trabalho lança depois dele', async () => {
      await repos.pacotes.creditar('ana', 3);
      const falha = new Error('falha no meio');

      await expect(
        repos.emTransacao(async (tx) => {
          await tx.pacotes.creditar('ana', 1);
          throw falha;
        }),
      ).rejects.toBe(falha);

      expect(await repos.pacotes.buscarPorAluno('ana')).toEqual({ alunoId: 'ana', saldo: 3 });
    });
  });
}
