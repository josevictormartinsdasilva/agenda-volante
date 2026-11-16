import { describe, expect, it } from 'vitest';
import {
  AlunoNaoEncontrado,
  AulaJaCancelada,
  AulaNaoEncontrada,
  HorarioForaDaGrade,
  HorarioOcupado,
  SaldoInsuficiente,
} from '../../src/domain/erros.js';
import { criarAmbiente } from '../helpers.js';

const H10 = new Date('2026-11-20T13:00:00.000Z'); // 10h em Fortaleza, 10 dias depois de "agora"
const H11 = new Date('2026-11-20T14:00:00.000Z');
const AMANHA_10H = new Date('2026-11-11T13:00:00.000Z'); // 25 h depois de "agora"

async function alunoComPacote(ambiente: ReturnType<typeof criarAmbiente>, saldo: number) {
  const aluno = await ambiente.casos.cadastrarAluno({ nome: 'Ana' });
  await ambiente.casos.registrarPacote(aluno.id, saldo);
  return aluno;
}

describe('cadastrarAluno e registrarPacote', () => {
  it('cadastra o aluno com o id gerado e o guarda no repositório', async () => {
    const { casos, repositorios } = criarAmbiente();

    const aluno = await casos.cadastrarAluno({ nome: 'Ana' });

    expect(aluno).toEqual({ id: 'id-1', nome: 'Ana' });
    expect(await repositorios.alunos.buscarPorId('id-1')).toEqual(aluno);
  });

  it('soma os créditos quando o aluno compra outro pacote', async () => {
    const ambiente = criarAmbiente();
    const aluno = await alunoComPacote(ambiente, 4);

    const pacote = await ambiente.casos.registrarPacote(aluno.id, 6);

    expect(pacote).toEqual({ alunoId: aluno.id, saldo: 10 });
  });

  it('recusa pacote para aluno que não existe', async () => {
    const { casos } = criarAmbiente();

    await expect(casos.registrarPacote('fantasma', 5)).rejects.toBeInstanceOf(AlunoNaoEncontrado);
  });
});

describe('publicarDisponibilidade e consultarHorariosLivres', () => {
  it('recusa horário que não está em hora cheia (R1)', async () => {
    const { casos } = criarAmbiente();

    await expect(
      casos.publicarDisponibilidade([new Date('2026-11-20T13:30:00.000Z')]),
    ).rejects.toBeInstanceOf(HorarioForaDaGrade);
  });

  it('lista só os horários do dia pedido, em ordem', async () => {
    const { casos } = criarAmbiente();
    await casos.publicarDisponibilidade([H11, H10, new Date('2026-11-21T13:00:00.000Z')]);

    const livres = await casos.consultarHorariosLivres('2026-11-20');

    expect(livres).toEqual([H10, H11]);
  });

  it('publicar o mesmo horário duas vezes não duplica', async () => {
    const { casos } = criarAmbiente();
    await casos.publicarDisponibilidade([H10]);
    await casos.publicarDisponibilidade([H10]);

    expect(await casos.consultarHorariosLivres('2026-11-20')).toEqual([H10]);
  });

  it('esconde o horário reservado e o devolve depois do cancelamento', async () => {
    const ambiente = criarAmbiente();
    const aluno = await alunoComPacote(ambiente, 1);
    await ambiente.casos.publicarDisponibilidade([H10, H11]);

    const { aula } = await ambiente.casos.reservarAula(aluno.id, H10);
    expect(await ambiente.casos.consultarHorariosLivres('2026-11-20')).toEqual([H11]);

    await ambiente.casos.cancelarAula(aula.id);
    expect(await ambiente.casos.consultarHorariosLivres('2026-11-20')).toEqual([H10, H11]);
  });
});

describe('reservarAula', () => {
  it('cria a aula reservada e consome 1 crédito do pacote', async () => {
    const ambiente = criarAmbiente();
    const aluno = await alunoComPacote(ambiente, 3);
    await ambiente.casos.publicarDisponibilidade([H10]);

    const { aula, pacote } = await ambiente.casos.reservarAula(aluno.id, H10);

    expect(aula).toMatchObject({ alunoId: aluno.id, inicio: H10, status: 'reservada' });
    expect(aula.fim).toEqual(new Date('2026-11-20T13:50:00.000Z'));
    expect(pacote.saldo).toBe(2);
    expect(await ambiente.repositorios.pacotes.buscarPorAluno(aluno.id)).toEqual(pacote);
    expect(await ambiente.repositorios.aulas.buscarPorId(aula.id)).toEqual(aula);
  });

  it('recusa quando o aluno não tem saldo (R5) e não grava a aula', async () => {
    const ambiente = criarAmbiente();
    const aluno = await alunoComPacote(ambiente, 0);
    await ambiente.casos.publicarDisponibilidade([H10]);

    await expect(ambiente.casos.reservarAula(aluno.id, H10)).rejects.toBeInstanceOf(
      SaldoInsuficiente,
    );
    expect(await ambiente.casos.consultarAgenda('2026-11-20')).toEqual([]);
  });

  it('trata aluno sem pacote como saldo zero', async () => {
    const { casos } = criarAmbiente();
    const aluno = await casos.cadastrarAluno({ nome: 'Bia' });
    await casos.publicarDisponibilidade([H10]);

    await expect(casos.reservarAula(aluno.id, H10)).rejects.toBeInstanceOf(SaldoInsuficiente);
  });

  it('recusa o segundo aluno no mesmo horário (R3) sem gastar o crédito dele', async () => {
    const ambiente = criarAmbiente();
    const ana = await alunoComPacote(ambiente, 1);
    const bia = await ambiente.casos.cadastrarAluno({ nome: 'Bia' });
    await ambiente.casos.registrarPacote(bia.id, 1);
    await ambiente.casos.publicarDisponibilidade([H10]);
    await ambiente.casos.reservarAula(ana.id, H10);

    await expect(ambiente.casos.reservarAula(bia.id, H10)).rejects.toBeInstanceOf(HorarioOcupado);
    expect((await ambiente.repositorios.pacotes.buscarPorAluno(bia.id))?.saldo).toBe(1);
  });

  it('recusa aluno que não existe', async () => {
    const { casos } = criarAmbiente();
    await casos.publicarDisponibilidade([H10]);

    await expect(casos.reservarAula('fantasma', H10)).rejects.toBeInstanceOf(AlunoNaoEncontrado);
  });
});

describe('cancelarAula (R6)', () => {
  it('com 48 h ou mais de antecedência devolve o crédito', async () => {
    const ambiente = criarAmbiente();
    const aluno = await alunoComPacote(ambiente, 1);
    await ambiente.casos.publicarDisponibilidade([H10]);
    const { aula } = await ambiente.casos.reservarAula(aluno.id, H10);

    const resultado = await ambiente.casos.cancelarAula(aula.id);

    expect(resultado.creditoDevolvido).toBe(true);
    expect(resultado.aula.status).toBe('cancelada');
    expect(resultado.pacote.saldo).toBe(1);
    expect((await ambiente.repositorios.aulas.buscarPorId(aula.id))?.status).toBe('cancelada');
    expect((await ambiente.repositorios.pacotes.buscarPorAluno(aluno.id))?.saldo).toBe(1);
  });

  it('com menos de 48 h a aula é consumida e o crédito não volta', async () => {
    const ambiente = criarAmbiente();
    const aluno = await alunoComPacote(ambiente, 1);
    await ambiente.casos.publicarDisponibilidade([AMANHA_10H]);
    const { aula } = await ambiente.casos.reservarAula(aluno.id, AMANHA_10H);

    const resultado = await ambiente.casos.cancelarAula(aula.id);

    expect(resultado.creditoDevolvido).toBe(false);
    expect(resultado.pacote.saldo).toBe(0);
    expect((await ambiente.repositorios.pacotes.buscarPorAluno(aluno.id))?.saldo).toBe(0);
  });

  it('recusa cancelar duas vezes e não devolve crédito em dobro', async () => {
    const ambiente = criarAmbiente();
    const aluno = await alunoComPacote(ambiente, 1);
    await ambiente.casos.publicarDisponibilidade([H10]);
    const { aula } = await ambiente.casos.reservarAula(aluno.id, H10);
    await ambiente.casos.cancelarAula(aula.id);

    await expect(ambiente.casos.cancelarAula(aula.id)).rejects.toBeInstanceOf(AulaJaCancelada);
    expect((await ambiente.repositorios.pacotes.buscarPorAluno(aluno.id))?.saldo).toBe(1);
  });

  it('recusa aula que não existe', async () => {
    const { casos } = criarAmbiente();

    await expect(casos.cancelarAula('fantasma')).rejects.toBeInstanceOf(AulaNaoEncontrada);
  });
});

describe('consultarAgenda', () => {
  it('lista as aulas reservadas do dia em ordem e ignora canceladas e de outros dias', async () => {
    const ambiente = criarAmbiente();
    const aluno = await alunoComPacote(ambiente, 5);
    const outroDia = new Date('2026-11-21T13:00:00.000Z');
    await ambiente.casos.publicarDisponibilidade([H10, H11, outroDia]);
    const segunda = await ambiente.casos.reservarAula(aluno.id, H11);
    const primeira = await ambiente.casos.reservarAula(aluno.id, H10);
    await ambiente.casos.reservarAula(aluno.id, outroDia);

    await ambiente.casos.cancelarAula(segunda.aula.id);

    const agenda = await ambiente.casos.consultarAgenda('2026-11-20');

    expect(agenda.map((a) => a.id)).toEqual([primeira.aula.id]);
  });
});
