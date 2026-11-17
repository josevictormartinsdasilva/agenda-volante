import { describe, expect, it } from 'vitest';
import {
  AlunoNaoEncontrado,
  AulaJaCancelada,
  AulaNaoEncontrada,
  HorarioComAulaReservada,
  HorarioForaDaGrade,
  HorarioIndisponivel,
  HorarioOcupado,
  RetiradaNoPassado,
  SaldoInsuficiente,
} from '../../src/domain/erros.js';
import { criarAluno, criarAmbiente } from '../helpers.js';

const H10 = new Date('2026-11-20T13:00:00.000Z'); // 10h em Fortaleza, 10 dias depois de "agora"
const H11 = new Date('2026-11-20T14:00:00.000Z');
const AMANHA_10H = new Date('2026-11-11T13:00:00.000Z'); // 25 h depois de "agora"

async function alunoComPacote(ambiente: ReturnType<typeof criarAmbiente>, saldo: number) {
  const aluno = await criarAluno(ambiente, 'Ana');
  await ambiente.casos.registrarPacote(aluno.id, saldo);
  return aluno;
}

describe('listarAlunos e registrarPacote', () => {
  it('lista os alunos em ordem de nome, com o e-mail de quem tem conta e o saldo', async () => {
    const ambiente = criarAmbiente();
    const semConta = await criarAluno(ambiente, 'Bia');
    const comConta = await ambiente.autenticacao.cadastrarAluno({
      nome: 'Ana',
      email: 'ana@exemplo.com',
      senha: 'senha-da-ana',
    });

    await ambiente.casos.registrarPacote(comConta.id, 4);

    expect(await ambiente.casos.listarAlunos()).toEqual([
      { id: comConta.id, nome: 'Ana', email: 'ana@exemplo.com', saldo: 4 },
      { id: semConta.id, nome: 'Bia', email: null, saldo: 0 },
    ]);
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
    const ambiente = criarAmbiente();
    const { casos } = ambiente;
    const aluno = await criarAluno(ambiente, 'Bia');
    await casos.publicarDisponibilidade([H10]);

    await expect(casos.reservarAula(aluno.id, H10)).rejects.toBeInstanceOf(SaldoInsuficiente);
  });

  it('recusa o segundo aluno no mesmo horário (R3) sem gastar o crédito dele', async () => {
    const ambiente = criarAmbiente();
    const ana = await alunoComPacote(ambiente, 1);
    const bia = await criarAluno(ambiente, 'Bia');
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

describe('saldo sob concorrência (R5 e R6)', () => {
  it('duas reservas simultâneas do mesmo aluno não gastam mais créditos do que ele tem', async () => {
    const ambiente = criarAmbiente();
    const aluno = await alunoComPacote(ambiente, 1);
    await ambiente.casos.publicarDisponibilidade([H10, H11]);

    const resultados = await Promise.allSettled([
      ambiente.casos.reservarAula(aluno.id, H10),
      ambiente.casos.reservarAula(aluno.id, H11),
    ]);

    const recusadas = resultados.filter((r) => r.status === 'rejected');
    expect(recusadas).toHaveLength(1);
    expect(recusadas[0]?.reason).toBeInstanceOf(SaldoInsuficiente);
    // A reserva recusada não deixa aula gravada: 1 crédito, 1 aula.
    expect(await ambiente.casos.consultarAgenda('2026-11-20')).toHaveLength(1);
    expect((await ambiente.repositorios.pacotes.buscarPorAluno(aluno.id))?.saldo).toBe(0);
  });

  it('dois cancelamentos simultâneos da mesma aula devolvem o crédito uma vez só', async () => {
    const ambiente = criarAmbiente();
    const aluno = await alunoComPacote(ambiente, 1);
    await ambiente.casos.publicarDisponibilidade([H10]);
    const { aula } = await ambiente.casos.reservarAula(aluno.id, H10);

    const resultados = await Promise.allSettled([
      ambiente.casos.cancelarAula(aula.id),
      ambiente.casos.cancelarAula(aula.id),
    ]);

    const recusados = resultados.filter((r) => r.status === 'rejected');
    expect(recusados).toHaveLength(1);
    expect(recusados[0]?.reason).toBeInstanceOf(AulaJaCancelada);
    expect((await ambiente.repositorios.pacotes.buscarPorAluno(aluno.id))?.saldo).toBe(1);
  });

  it('dois pacotes registrados ao mesmo tempo somam os dois', async () => {
    const ambiente = criarAmbiente();
    const aluno = await criarAluno(ambiente, 'Ana');

    await Promise.all([
      ambiente.casos.registrarPacote(aluno.id, 4),
      ambiente.casos.registrarPacote(aluno.id, 6),
    ]);

    expect((await ambiente.repositorios.pacotes.buscarPorAluno(aluno.id))?.saldo).toBe(10);
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

describe('retirarDisponibilidade', () => {
  it('retira o horário livre: ele some dos horários livres e não aceita mais reserva (R4)', async () => {
    const ambiente = criarAmbiente();
    const aluno = await alunoComPacote(ambiente, 1);
    await ambiente.casos.publicarDisponibilidade([H10, H11]);

    const resultado = await ambiente.casos.retirarDisponibilidade(H10);

    expect(resultado).toEqual({ aulaCancelada: null });
    expect(await ambiente.casos.consultarHorariosLivres('2026-11-20')).toEqual([H11]);
    await expect(ambiente.casos.reservarAula(aluno.id, H10)).rejects.toBeInstanceOf(
      HorarioIndisponivel,
    );
  });

  it('recusa horário que não está publicado', async () => {
    const { casos } = criarAmbiente();

    await expect(casos.retirarDisponibilidade(H10)).rejects.toBeInstanceOf(HorarioIndisponivel);
  });

  it('recusa horário que já começou ou já passou, e ele continua publicado', async () => {
    const ambiente = criarAmbiente();
    await ambiente.casos.publicarDisponibilidade([H10]);
    ambiente.relogio.agora = H10;

    await expect(ambiente.casos.retirarDisponibilidade(H10)).rejects.toBeInstanceOf(
      RetiradaNoPassado,
    );
    expect(await ambiente.repositorios.disponibilidade.listarEntre(H10, H11)).toEqual([H10]);
  });

  it('com aula reservada e sem confirmação, recusa e não muda nada', async () => {
    const ambiente = criarAmbiente();
    const aluno = await alunoComPacote(ambiente, 1);
    await ambiente.casos.publicarDisponibilidade([H10]);
    const { aula } = await ambiente.casos.reservarAula(aluno.id, H10);

    await expect(ambiente.casos.retirarDisponibilidade(H10)).rejects.toBeInstanceOf(
      HorarioComAulaReservada,
    );
    expect(await ambiente.repositorios.disponibilidade.listarEntre(H10, H11)).toEqual([H10]);
    expect((await ambiente.repositorios.aulas.buscarPorId(aula.id))?.status).toBe('reservada');
    expect((await ambiente.repositorios.pacotes.buscarPorAluno(aluno.id))?.saldo).toBe(0);
  });

  it('com confirmação, cancela a aula e devolve o crédito mesmo a menos de 48 h (sem R6)', async () => {
    const ambiente = criarAmbiente();
    const aluno = await alunoComPacote(ambiente, 1);
    await ambiente.casos.publicarDisponibilidade([AMANHA_10H]);
    const { aula } = await ambiente.casos.reservarAula(aluno.id, AMANHA_10H);

    const resultado = await ambiente.casos.retirarDisponibilidade(AMANHA_10H, {
      cancelarAula: true,
    });

    expect(resultado.aulaCancelada).toEqual({ ...aula, status: 'cancelada' });
    expect((await ambiente.repositorios.aulas.buscarPorId(aula.id))?.status).toBe('cancelada');
    expect((await ambiente.repositorios.pacotes.buscarPorAluno(aluno.id))?.saldo).toBe(1);
    expect(await ambiente.casos.consultarHorariosLivres('2026-11-11')).toEqual([]);
  });

  it('aula já cancelada no horário não impede a retirada nem devolve crédito', async () => {
    const ambiente = criarAmbiente();
    const aluno = await alunoComPacote(ambiente, 1);
    await ambiente.casos.publicarDisponibilidade([AMANHA_10H]);
    const { aula } = await ambiente.casos.reservarAula(aluno.id, AMANHA_10H);
    await ambiente.casos.cancelarAula(aula.id); // a menos de 48 h: crédito consumido

    expect(await ambiente.casos.retirarDisponibilidade(AMANHA_10H)).toEqual({
      aulaCancelada: null,
    });
    expect((await ambiente.repositorios.pacotes.buscarPorAluno(aluno.id))?.saldo).toBe(0);
  });

  it('reserva e retirada simultâneas: a aula nunca fica num horário retirado (R4)', async () => {
    const ambiente = criarAmbiente();
    const aluno = await alunoComPacote(ambiente, 1);
    await ambiente.casos.publicarDisponibilidade([H10]);

    const [reserva, retirada] = await Promise.allSettled([
      ambiente.casos.reservarAula(aluno.id, H10),
      ambiente.casos.retirarDisponibilidade(H10),
    ]);

    // Exatamente uma das duas passa; a outra é recusada pela regra certa.
    expect([reserva.status, retirada.status].sort()).toEqual(['fulfilled', 'rejected']);
    if (reserva.status === 'rejected') {
      expect(reserva.reason).toBeInstanceOf(HorarioIndisponivel);
      expect((await ambiente.repositorios.pacotes.buscarPorAluno(aluno.id))?.saldo).toBe(1);
    } else if (retirada.status === 'rejected') {
      expect(retirada.reason).toBeInstanceOf(HorarioComAulaReservada);
      expect(await ambiente.repositorios.disponibilidade.listarEntre(H10, H11)).toEqual([H10]);
    }
  });
});
