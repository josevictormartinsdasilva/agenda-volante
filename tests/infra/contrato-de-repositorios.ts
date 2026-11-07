import { beforeEach, describe, expect, it } from 'vitest';
import { HorarioOcupado } from '../../src/domain/erros.js';
import type { Repositorios } from '../../src/domain/repositorios.js';
import type { Aula } from '../../src/domain/tipos.js';

const H10 = new Date('2026-11-20T13:00:00.000Z');
const H11 = new Date('2026-11-20T14:00:00.000Z');
const H12 = new Date('2026-11-20T15:00:00.000Z');

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
  criar: () => Promise<Repositorios>,
  opcoes: { pular?: boolean } = {},
): void {
  describe.skipIf(opcoes.pular)(`contrato dos repositórios: ${nome}`, () => {
    let repos: Repositorios;

    beforeEach(async () => {
      repos = await criar();
      await repos.alunos.salvar({ id: 'ana', nome: 'Ana' });
    });

    it('aluno: guarda e busca por id; id desconhecido devolve undefined', async () => {
      expect(await repos.alunos.buscarPorId('ana')).toEqual({ id: 'ana', nome: 'Ana' });
      expect(await repos.alunos.buscarPorId('fantasma')).toBeUndefined();
    });

    it('pacote: salvar de novo substitui o saldo', async () => {
      expect(await repos.pacotes.buscarPorAluno('ana')).toBeUndefined();

      await repos.pacotes.salvar({ alunoId: 'ana', saldo: 5 });
      await repos.pacotes.salvar({ alunoId: 'ana', saldo: 4 });

      expect(await repos.pacotes.buscarPorAluno('ana')).toEqual({ alunoId: 'ana', saldo: 4 });
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
  });
}
