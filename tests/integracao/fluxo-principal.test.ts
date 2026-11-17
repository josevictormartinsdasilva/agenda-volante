import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { criarApp } from '../helpers.js';

const H10 = '2026-11-20T13:00:00.000Z'; // 10h em Fortaleza
const H11 = '2026-11-20T14:00:00.000Z';

type Cabecalho = { authorization: string };

describe('fluxo principal pela API', () => {
  let app: FastifyInstance;
  let teste: ReturnType<typeof criarApp>;
  let instrutor: Cabecalho;

  beforeEach(async () => {
    teste = criarApp();
    app = teste.app;
    instrutor = await teste.comoInstrutor();
  });
  afterEach(() => app.close());

  /** Aluno com conta e login, e pacote registrado pelo instrutor. */
  async function alunoComPacote(quantidade: number) {
    const aluno = await teste.comoAluno();
    await app.inject({
      method: 'POST',
      url: `/alunos/${aluno.alunoId}/pacote`,
      headers: instrutor,
      payload: { quantidade },
    });
    return aluno;
  }

  const publicar = (inicios: string[]) =>
    app.inject({ method: 'POST', url: '/disponibilidades', headers: instrutor, payload: { inicios } });

  const reservar = (headers: Cabecalho, inicio: string) =>
    app.inject({ method: 'POST', url: '/aulas', headers, payload: { inicio } });

  it('publica, consulta, reserva, vê a agenda e cancela devolvendo o crédito', async () => {
    const aluno = await alunoComPacote(2);

    expect((await publicar([H10, H11])).statusCode).toBe(204);

    const livres = await app.inject({
      method: 'GET',
      url: '/horarios-livres?data=2026-11-20',
      headers: aluno.headers,
    });
    expect(livres.statusCode).toBe(200);
    expect(livres.json()).toEqual({ data: '2026-11-20', horarios: [H10, H11] });

    const reserva = await reservar(aluno.headers, H10);
    expect(reserva.statusCode).toBe(201);
    const { aula, pacote } = reserva.json<{
      aula: { id: string; alunoId: string; inicio: string; fim: string; status: string };
      pacote: { saldo: number };
    }>();
    expect(aula).toMatchObject({
      alunoId: aluno.alunoId, // veio da sessão, não do corpo
      inicio: H10,
      fim: '2026-11-20T13:50:00.000Z',
      status: 'reservada',
    });
    expect(pacote.saldo).toBe(1);

    const restantes = await app.inject({
      method: 'GET',
      url: '/horarios-livres?data=2026-11-20',
      headers: aluno.headers,
    });
    expect(restantes.json()).toEqual({ data: '2026-11-20', horarios: [H11] });

    const agenda = await app.inject({ method: 'GET', url: '/agenda?data=2026-11-20', headers: instrutor });
    expect(agenda.statusCode).toBe(200);
    expect(agenda.json<{ aulas: { id: string }[] }>().aulas.map((a) => a.id)).toEqual([aula.id]);

    const cancelamento = await app.inject({
      method: 'POST',
      url: `/aulas/${aula.id}/cancelar`,
      headers: aluno.headers,
    });
    expect(cancelamento.statusCode).toBe(200);
    expect(cancelamento.json()).toMatchObject({
      aula: { id: aula.id, status: 'cancelada' },
      pacote: { alunoId: aluno.alunoId, saldo: 2 },
      creditoDevolvido: true,
    });

    const agendaDepois = await app.inject({
      method: 'GET',
      url: '/agenda?data=2026-11-20',
      headers: instrutor,
    });
    expect(agendaDepois.json()).toEqual({ data: '2026-11-20', aulas: [] });
  });

  it('responde 409 quando o horário já está reservado', async () => {
    const aluno = await alunoComPacote(2);
    await publicar([H10]);
    await reservar(aluno.headers, H10);

    const segunda = await reservar(aluno.headers, H10);

    expect(segunda.statusCode).toBe(409);
    expect(segunda.json()).toEqual({ erro: 'Esse horário já está reservado' });
  });

  it('responde 422 quando falta saldo', async () => {
    const aluno = await alunoComPacote(1);
    await publicar([H10, H11]);
    await reservar(aluno.headers, H10);

    const semSaldo = await reservar(aluno.headers, H11);

    expect(semSaldo.statusCode).toBe(422);
    expect(semSaldo.json()).toEqual({ erro: 'Saldo de aulas insuficiente no pacote' });
  });

  it('responde 404 para aula inexistente e 400 para dados inválidos', async () => {
    const naoExiste = await app.inject({
      method: 'POST',
      url: '/aulas/fantasma/cancelar',
      headers: instrutor,
    });
    expect(naoExiste.statusCode).toBe(404);

    const dataRuim = await app.inject({ method: 'GET', url: '/agenda?data=amanha', headers: instrutor });
    expect(dataRuim.statusCode).toBe(400);

    const corpoRuim = await app.inject({ method: 'POST', url: '/alunos', payload: { nome: '' } });
    expect(corpoRuim.statusCode).toBe(400);
  });
  describe('retirar horário', () => {
    const retirar = (headers: Cabecalho, payload: object) =>
      app.inject({ method: 'POST', url: '/disponibilidades/retirar', headers, payload });

    it('retira o horário livre e ele some dos horários livres', async () => {
      await publicar([H10, H11]);

      const retirada = await retirar(instrutor, { inicio: H10 });

      expect(retirada.statusCode).toBe(200);
      expect(retirada.json()).toEqual({ aulaCancelada: null });
      const livres = await app.inject({
        method: 'GET',
        url: '/horarios-livres?data=2026-11-20',
        headers: instrutor,
      });
      expect(livres.json()).toEqual({ data: '2026-11-20', horarios: [H11] });
    });

    it('com aula reservada responde 409; confirmado, cancela e devolve o crédito', async () => {
      const aluno = await alunoComPacote(1);
      await publicar([H10]);
      await reservar(aluno.headers, H10);

      const semConfirmar = await retirar(instrutor, { inicio: H10 });
      expect(semConfirmar.statusCode).toBe(409);

      const confirmado = await retirar(instrutor, { inicio: H10, cancelarAula: true });
      expect(confirmado.statusCode).toBe(200);
      expect(confirmado.json()).toMatchObject({
        aulaCancelada: { alunoId: aluno.alunoId, inicio: H10, status: 'cancelada' },
      });
      const minhas = await app.inject({ method: 'GET', url: '/minhas-aulas', headers: aluno.headers });
      expect(minhas.json()).toMatchObject({ saldo: 1, aulas: [{ status: 'cancelada' }] });
    });

    it('só o instrutor retira; horário não publicado responde 422', async () => {
      const aluno = await teste.comoAluno();
      await publicar([H10]);

      expect((await retirar(aluno.headers, { inicio: H10 })).statusCode).toBe(403);
      expect((await retirar(instrutor, { inicio: H11 })).statusCode).toBe(422);
    });
  });
});
