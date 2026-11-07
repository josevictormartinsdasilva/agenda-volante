import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { criarAmbiente } from '../helpers.js';

const H10 = '2026-11-20T13:00:00.000Z'; // 10h em Fortaleza
const H11 = '2026-11-20T14:00:00.000Z';

describe('fluxo principal pela API', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    const { casos } = criarAmbiente();
    app = buildApp({ logLevel: 'silent' }, casos);
  });
  afterEach(() => app.close());

  async function alunoComPacote(quantidade: number): Promise<string> {
    const aluno = await app.inject({ method: 'POST', url: '/alunos', payload: { nome: 'Ana' } });
    const { id } = aluno.json<{ id: string }>();
    await app.inject({ method: 'POST', url: `/alunos/${id}/pacote`, payload: { quantidade } });
    return id;
  }

  it('publica, consulta, reserva, vê a agenda e cancela devolvendo o crédito', async () => {
    const alunoId = await alunoComPacote(2);

    const publicada = await app.inject({
      method: 'POST',
      url: '/disponibilidades',
      payload: { inicios: [H10, H11] },
    });
    expect(publicada.statusCode).toBe(204);

    const livres = await app.inject({ method: 'GET', url: '/horarios-livres?data=2026-11-20' });
    expect(livres.statusCode).toBe(200);
    expect(livres.json()).toEqual({ data: '2026-11-20', horarios: [H10, H11] });

    const reserva = await app.inject({
      method: 'POST',
      url: '/aulas',
      payload: { alunoId, inicio: H10 },
    });
    expect(reserva.statusCode).toBe(201);
    const { aula, pacote } = reserva.json<{
      aula: { id: string; inicio: string; fim: string; status: string };
      pacote: { saldo: number };
    }>();
    expect(aula).toMatchObject({ inicio: H10, fim: '2026-11-20T13:50:00.000Z', status: 'reservada' });
    expect(pacote.saldo).toBe(1);

    const restantes = await app.inject({ method: 'GET', url: '/horarios-livres?data=2026-11-20' });
    expect(restantes.json()).toEqual({ data: '2026-11-20', horarios: [H11] });

    const agenda = await app.inject({ method: 'GET', url: '/agenda?data=2026-11-20' });
    expect(agenda.statusCode).toBe(200);
    expect(agenda.json<{ aulas: { id: string }[] }>().aulas.map((a) => a.id)).toEqual([aula.id]);

    const cancelamento = await app.inject({ method: 'POST', url: `/aulas/${aula.id}/cancelar` });
    expect(cancelamento.statusCode).toBe(200);
    expect(cancelamento.json()).toMatchObject({
      aula: { id: aula.id, status: 'cancelada' },
      pacote: { alunoId, saldo: 2 },
      creditoDevolvido: true,
    });

    const agendaDepois = await app.inject({ method: 'GET', url: '/agenda?data=2026-11-20' });
    expect(agendaDepois.json()).toEqual({ data: '2026-11-20', aulas: [] });
  });

  it('responde 409 quando o horário já está reservado', async () => {
    const alunoId = await alunoComPacote(2);
    await app.inject({ method: 'POST', url: '/disponibilidades', payload: { inicios: [H10] } });
    await app.inject({ method: 'POST', url: '/aulas', payload: { alunoId, inicio: H10 } });

    const segunda = await app.inject({ method: 'POST', url: '/aulas', payload: { alunoId, inicio: H10 } });

    expect(segunda.statusCode).toBe(409);
    expect(segunda.json()).toEqual({ erro: 'Esse horário já está reservado' });
  });

  it('responde 422 quando falta saldo', async () => {
    const alunoId = await alunoComPacote(1);
    await app.inject({ method: 'POST', url: '/disponibilidades', payload: { inicios: [H10, H11] } });
    await app.inject({ method: 'POST', url: '/aulas', payload: { alunoId, inicio: H10 } });

    const semSaldo = await app.inject({ method: 'POST', url: '/aulas', payload: { alunoId, inicio: H11 } });

    expect(semSaldo.statusCode).toBe(422);
    expect(semSaldo.json()).toEqual({ erro: 'Saldo de aulas insuficiente no pacote' });
  });

  it('responde 404 para aula inexistente e 400 para dados inválidos', async () => {
    const naoExiste = await app.inject({ method: 'POST', url: '/aulas/fantasma/cancelar' });
    expect(naoExiste.statusCode).toBe(404);

    const dataRuim = await app.inject({ method: 'GET', url: '/agenda?data=amanha' });
    expect(dataRuim.statusCode).toBe(400);

    const corpoRuim = await app.inject({ method: 'POST', url: '/alunos', payload: { nome: '' } });
    expect(corpoRuim.statusCode).toBe(400);
  });
});
