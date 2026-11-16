import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../helpers.js';

const H10 = '2026-11-20T13:00:00.000Z';
const H11 = '2026-11-20T14:00:00.000Z';
const ANA = { nome: 'Ana', email: 'ana@exemplo.com', senha: 'senha-da-ana' };

describe('cadastro, login e autorização pela API', () => {
  let app: FastifyInstance;
  let teste: ReturnType<typeof criarApp>;

  beforeEach(() => {
    teste = criarApp();
    app = teste.app;
  });
  afterEach(() => app.close());

  const entrar = (email: string, senha: string) =>
    app.inject({ method: 'POST', url: '/sessoes', payload: { email, senha } });

  describe('cadastro do aluno', () => {
    it('cria a conta sem devolver a senha e recusa o mesmo e-mail de novo', async () => {
      const criada = await app.inject({ method: 'POST', url: '/alunos', payload: ANA });
      const repetida = await app.inject({
        method: 'POST',
        url: '/alunos',
        payload: { ...ANA, email: 'ANA@exemplo.com' },
      });

      expect(criada.statusCode).toBe(201);
      expect(criada.json()).toEqual({ id: expect.any(String), nome: 'Ana', email: 'ana@exemplo.com' });
      expect(criada.body).not.toContain('senha');
      expect(repetida.statusCode).toBe(409);
      expect(repetida.json()).toEqual({ erro: 'Já existe uma conta com esse e-mail' });
    });

    it('recusa senha curta e e-mail malformado', async () => {
      const senhaCurta = await app.inject({
        method: 'POST',
        url: '/alunos',
        payload: { ...ANA, senha: '1234567' },
      });
      const emailRuim = await app.inject({
        method: 'POST',
        url: '/alunos',
        payload: { ...ANA, email: 'ana-sem-arroba' },
      });

      expect(senhaCurta.statusCode).toBe(400);
      expect(emailRuim.statusCode).toBe(400);
    });
  });

  describe('login e logout', () => {
    it('devolve um token que identifica o aluno nas chamadas seguintes', async () => {
      const { id } = (await app.inject({ method: 'POST', url: '/alunos', payload: ANA })).json<{
        id: string;
      }>();

      const login = await entrar(ANA.email, ANA.senha);

      expect(login.statusCode).toBe(201);
      const sessao = login.json<{ token: string; papel: string; alunoId: string; expiraEm: string }>();
      expect(sessao).toMatchObject({ papel: 'aluno', alunoId: id });
      expect(new Date(sessao.expiraEm).getTime()).toBeGreaterThan(Date.parse('2026-11-10T12:00:00Z'));

      const livres = await app.inject({
        method: 'GET',
        url: '/horarios-livres?data=2026-11-20',
        headers: { authorization: `Bearer ${sessao.token}` },
      });
      expect(livres.statusCode).toBe(200);
    });

    it('responde 401 com a mesma mensagem para senha errada e e-mail desconhecido', async () => {
      await app.inject({ method: 'POST', url: '/alunos', payload: ANA });

      const senhaErrada = await entrar(ANA.email, 'senha-errada');
      const desconhecido = await entrar('ninguem@exemplo.com', ANA.senha);

      expect(senhaErrada.statusCode).toBe(401);
      expect(desconhecido.statusCode).toBe(401);
      expect(senhaErrada.json()).toEqual({ erro: 'E-mail ou senha inválidos' });
      expect(desconhecido.json()).toEqual(senhaErrada.json());
    });

    it('erros demais no login respondem 429 com Retry-After, e a origem é o IP do cliente', async () => {
      await app.inject({ method: 'POST', url: '/alunos', payload: ANA });
      for (let i = 0; i < 5; i++) {
        expect((await entrar(ANA.email, 'senha-errada')).statusCode).toBe(401);
      }

      const bloqueado = await entrar(ANA.email, ANA.senha);

      expect(bloqueado.statusCode).toBe(429);
      expect(bloqueado.headers['retry-after']).toBe(String(15 * 60));
      expect(bloqueado.json()).toEqual({
        erro: 'Muitas tentativas de login. Tente de novo em 15 minutos',
      });

      // O limite por origem usa o IP da requisição: outro IP errando 20 vezes em
      // e-mails diferentes é bloqueado; este cliente (127.0.0.1) não é afetado.
      for (let i = 0; i < 20; i++) {
        await app.inject({
          method: 'POST',
          url: '/sessoes',
          remoteAddress: '203.0.113.7',
          payload: { email: `alvo${i}@exemplo.com`, senha: 'chute' },
        });
      }
      const doAtacante = await app.inject({
        method: 'POST',
        url: '/sessoes',
        remoteAddress: '203.0.113.7',
        payload: { email: 'mais-um@exemplo.com', senha: 'chute' },
      });
      expect(doAtacante.statusCode).toBe(429);
      expect((await entrar('mais-um@exemplo.com', 'chute')).statusCode).toBe(401);
    });

    it('depois do logout o token deixa de valer', async () => {
      const aluno = await teste.comoAluno();

      const saida = await app.inject({ method: 'DELETE', url: '/sessoes/atual', headers: aluno.headers });
      const depois = await app.inject({
        method: 'GET',
        url: '/horarios-livres?data=2026-11-20',
        headers: aluno.headers,
      });

      expect(saida.statusCode).toBe(204);
      expect(depois.statusCode).toBe(401);
    });

  });

  describe('administrador', () => {
    const NOVO = { email: 'novo.instrutor@exemplo.com', senha: 'senha-do-novo' };

    it('cadastra um instrutor, que passa a entrar e a usar as rotas de instrutor', async () => {
      const admin = await teste.comoAdmin();

      const criado = await app.inject({ method: 'POST', url: '/instrutores', headers: admin, payload: NOVO });
      const login = await entrar(NOVO.email, NOVO.senha);

      expect(criado.statusCode).toBe(201);
      expect(criado.json()).toEqual({ id: expect.any(String), email: NOVO.email });
      expect(criado.body).not.toContain('senha');
      expect(login.statusCode).toBe(201);
      expect(login.json()).toMatchObject({ papel: 'instrutor', alunoId: null });

      const agenda = await app.inject({
        method: 'GET',
        url: '/agenda?data=2026-11-20',
        headers: { authorization: `Bearer ${login.json<{ token: string }>().token}` },
      });
      expect(agenda.statusCode).toBe(200);
    });

    it('recusa e-mail repetido (409) e senha curta (400)', async () => {
      const admin = await teste.comoAdmin();
      await app.inject({ method: 'POST', url: '/instrutores', headers: admin, payload: NOVO });

      const repetido = await app.inject({ method: 'POST', url: '/instrutores', headers: admin, payload: NOVO });
      const senhaCurta = await app.inject({
        method: 'POST',
        url: '/instrutores',
        headers: admin,
        payload: { email: 'outro@exemplo.com', senha: '1234567' },
      });

      expect(repetido.statusCode).toBe(409);
      expect(senhaCurta.statusCode).toBe(400);
    });

    it('só o administrador cadastra instrutor: instrutor e aluno recebem 403', async () => {
      const instrutor = await teste.comoInstrutor();
      const aluno = await teste.comoAluno();

      for (const headers of [instrutor, aluno.headers]) {
        const resposta = await app.inject({ method: 'POST', url: '/instrutores', headers, payload: NOVO });
        expect(resposta.statusCode).toBe(403);
      }
      expect(await teste.ambiente.repositorios.usuarios.buscarPorEmail(NOVO.email)).toBeUndefined();
    });

    it('o administrador não opera a agenda: só administra contas', async () => {
      const admin = await teste.comoAdmin();

      const agenda = await app.inject({ method: 'GET', url: '/agenda?data=2026-11-20', headers: admin });
      const reserva = await app.inject({
        method: 'POST',
        url: '/aulas',
        headers: admin,
        payload: { alunoId: 'qualquer', inicio: H10 },
      });

      expect(agenda.statusCode).toBe(403);
      expect(reserva.statusCode).toBe(403);
    });
  });

  describe('sem login', () => {
    it.each([
      ['POST', '/instrutores'],
      ['GET', '/alunos'],
      ['POST', '/alunos/qualquer/pacote'],
      ['POST', '/disponibilidades'],
      ['GET', '/horarios-livres?data=2026-11-20'],
      ['POST', '/aulas'],
      ['GET', '/agenda?data=2026-11-20'],
      ['POST', '/aulas/qualquer/cancelar'],
      ['DELETE', '/sessoes/atual'],
    ] as const)('%s %s responde 401', async (method, url) => {
      const resposta = await app.inject({ method, url });

      expect(resposta.statusCode).toBe(401);
      expect(resposta.json()).toEqual({ erro: 'Faça login para continuar' });
    });

    it.each(['Bearer token-inventado', 'Basic YWJjOmRlZg==', 'Bearer'])(
      'recusa o cabeçalho "%s"',
      async (authorization) => {
        const resposta = await app.inject({
          method: 'GET',
          url: '/agenda?data=2026-11-20',
          headers: { authorization },
        });

        expect(resposta.statusCode).toBe(401);
      },
    );

    it('as rotas de saúde continuam abertas', async () => {
      for (const url of ['/health', '/ready']) {
        expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);
      }
    });
  });

  describe('o aluno não faz o que é do instrutor', () => {
    it.each([
      ['GET', '/alunos', undefined],
      ['POST', '/alunos/qualquer/pacote', { quantidade: 10 }],
      ['POST', '/disponibilidades', { inicios: [H10] }],
      ['GET', '/agenda?data=2026-11-20', undefined],
    ] as const)('%s %s responde 403', async (method, url, payload) => {
      const aluno = await teste.comoAluno();

      const resposta = await app.inject({ method, url, headers: aluno.headers, payload });

      expect(resposta.statusCode).toBe(403);
      expect(resposta.json()).toEqual({ erro: 'Você não tem permissão para esta operação' });
    });

    it('não consegue se dar créditos', async () => {
      const aluno = await teste.comoAluno();

      await app.inject({
        method: 'POST',
        url: `/alunos/${aluno.alunoId}/pacote`,
        headers: aluno.headers,
        payload: { quantidade: 10 },
      });

      expect(await teste.ambiente.repositorios.pacotes.buscarPorAluno(aluno.alunoId)).toBeUndefined();
    });
  });

  describe('um aluno não age em nome de outro', () => {
    async function doisAlunosComAula() {
      const instrutor = await teste.comoInstrutor();
      const ana = await teste.comoAluno('Ana');
      const bia = await teste.comoAluno('Bia');
      for (const aluno of [ana, bia]) {
        await app.inject({
          method: 'POST',
          url: `/alunos/${aluno.alunoId}/pacote`,
          headers: instrutor,
          payload: { quantidade: 1 },
        });
      }
      await app.inject({
        method: 'POST',
        url: '/disponibilidades',
        headers: instrutor,
        payload: { inicios: [H10, H11] },
      });
      const reserva = await app.inject({
        method: 'POST',
        url: '/aulas',
        headers: ana.headers,
        payload: { inicio: H10 },
      });
      return { instrutor, ana, bia, aulaDaAna: reserva.json<{ aula: { id: string } }>().aula.id };
    }

    it('reservar informando o alunoId de outro responde 403 e não gasta o crédito dele', async () => {
      const { ana, bia } = await doisAlunosComAula();

      const resposta = await app.inject({
        method: 'POST',
        url: '/aulas',
        headers: bia.headers,
        payload: { alunoId: ana.alunoId, inicio: H11 },
      });

      expect(resposta.statusCode).toBe(403);
      const pacoteDaAna = await teste.ambiente.repositorios.pacotes.buscarPorAluno(ana.alunoId);
      expect(pacoteDaAna?.saldo).toBe(0); // só o débito da reserva que ela mesma fez
    });

    it('cancelar a aula de outro responde 404, como se ela não existisse, e a aula segue reservada', async () => {
      const { bia, aulaDaAna } = await doisAlunosComAula();

      const resposta = await app.inject({
        method: 'POST',
        url: `/aulas/${aulaDaAna}/cancelar`,
        headers: bia.headers,
      });

      expect(resposta.statusCode).toBe(404);
      expect(resposta.json()).toEqual({ erro: 'Aula não encontrada' });
      expect((await teste.ambiente.repositorios.aulas.buscarPorId(aulaDaAna))?.status).toBe('reservada');
    });

    it('o instrutor reserva para um aluno informando o alunoId, e cancela a aula de qualquer um', async () => {
      const { instrutor, bia, aulaDaAna } = await doisAlunosComAula();

      const reserva = await app.inject({
        method: 'POST',
        url: '/aulas',
        headers: instrutor,
        payload: { alunoId: bia.alunoId, inicio: H11 },
      });
      const semAluno = await app.inject({
        method: 'POST',
        url: '/aulas',
        headers: instrutor,
        payload: { inicio: H11 },
      });
      const cancelamento = await app.inject({
        method: 'POST',
        url: `/aulas/${aulaDaAna}/cancelar`,
        headers: instrutor,
      });

      expect(reserva.statusCode).toBe(201);
      expect(reserva.json()).toMatchObject({ aula: { alunoId: bia.alunoId } });
      expect(semAluno.statusCode).toBe(400);
      expect(semAluno.json()).toEqual({ erro: 'Informe o alunoId da reserva' });
      expect(cancelamento.statusCode).toBe(200);
    });
  });

  it('o instrutor lista os alunos com o e-mail, sem hash de senha', async () => {
    const instrutor = await teste.comoInstrutor();
    const ana = await teste.comoAluno('Ana');

    const resposta = await app.inject({ method: 'GET', url: '/alunos', headers: instrutor });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ alunos: [{ id: ana.alunoId, nome: 'Ana', email: ana.email }] });
  });
});
