import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../helpers.js';

const H10 = '2026-11-20T13:00:00.000Z';

describe('conta do aluno pela API', () => {
  let app: FastifyInstance;
  let teste: ReturnType<typeof criarApp>;

  beforeEach(() => {
    teste = criarApp();
    app = teste.app;
  });
  afterEach(() => app.close());

  const entrar = (email: string, senha: string) =>
    app.inject({ method: 'POST', url: '/sessoes', payload: { email, senha } });

  describe('POST /conta/senha', () => {
    it('troca a senha de quem está logado; a senha antiga deixa de valer', async () => {
      const aluno = await teste.comoAluno();

      const troca = await app.inject({
        method: 'POST',
        url: '/conta/senha',
        headers: aluno.headers,
        payload: { senhaAtual: aluno.senha, novaSenha: 'senha-nova-do-aluno' },
      });

      expect(troca.statusCode).toBe(204);
      expect((await entrar(aluno.email, aluno.senha)).statusCode).toBe(401);
      expect((await entrar(aluno.email, 'senha-nova-do-aluno')).statusCode).toBe(201);
      // A sessão usada na troca continua valendo.
      const livres = await app.inject({
        method: 'GET',
        url: '/horarios-livres?data=2026-11-20',
        headers: aluno.headers,
      });
      expect(livres.statusCode).toBe(200);
    });

    it('senha atual errada: 403; senha nova curta: 400; sem login: 401', async () => {
      const aluno = await teste.comoAluno();
      const trocar = (headers: Record<string, string>, payload: object) =>
        app.inject({ method: 'POST', url: '/conta/senha', headers, payload });

      const errada = await trocar(aluno.headers, { senhaAtual: 'chute', novaSenha: 'senha-nova-do-aluno' });
      const curta = await trocar(aluno.headers, { senhaAtual: aluno.senha, novaSenha: '1234567' });
      const semLogin = await trocar({}, { senhaAtual: aluno.senha, novaSenha: 'senha-nova-do-aluno' });

      expect(errada.statusCode).toBe(403);
      expect(errada.json()).toEqual({ erro: 'Senha incorreta' });
      expect(curta.statusCode).toBe(400);
      expect(semLogin.statusCode).toBe(401);
    });

    it('instrutor e administrador também trocam a própria senha', async () => {
      const instrutor = await teste.comoInstrutor();
      const admin = await teste.comoAdmin();

      for (const [headers, senhaAtual] of [
        [instrutor, 'senha-do-instrutor'],
        [admin, 'senha-do-admin'],
      ] as const) {
        const troca = await app.inject({
          method: 'POST',
          url: '/conta/senha',
          headers,
          payload: { senhaAtual, novaSenha: 'uma-senha-bem-nova' },
        });
        expect(troca.statusCode).toBe(204);
      }
    });
  });

  describe('código de redefinição', () => {
    it('o instrutor gera, o aluno redefine sem estar logado, e entra com a senha nova', async () => {
      const instrutor = await teste.comoInstrutor();
      const aluno = await teste.comoAluno();

      const gerado = await app.inject({
        method: 'POST',
        url: `/alunos/${aluno.alunoId}/codigo-de-redefinicao`,
        headers: instrutor,
      });
      expect(gerado.statusCode).toBe(201);
      const { codigo } = gerado.json<{ codigo: string; expiraEm: string }>();

      const redefinida = await app.inject({
        method: 'POST',
        url: '/senha/redefinicao',
        payload: { email: aluno.email, codigo, novaSenha: 'senha-redefinida' },
      });
      const reuso = await app.inject({
        method: 'POST',
        url: '/senha/redefinicao',
        payload: { email: aluno.email, codigo, novaSenha: 'outra-senha-qualquer' },
      });

      expect(redefinida.statusCode).toBe(204);
      expect(reuso.statusCode).toBe(400);
      expect(reuso.json()).toEqual({ erro: 'Código inválido ou expirado' });
      expect((await entrar(aluno.email, 'senha-redefinida')).statusCode).toBe(201);
    });

    it('só o instrutor gera código: aluno e administrador recebem 403', async () => {
      const aluno = await teste.comoAluno();
      const admin = await teste.comoAdmin();

      for (const headers of [aluno.headers, admin]) {
        const resposta = await app.inject({
          method: 'POST',
          url: `/alunos/${aluno.alunoId}/codigo-de-redefinicao`,
          headers,
        });
        expect(resposta.statusCode).toBe(403);
      }
    });

    it('aluno inexistente: 404', async () => {
      const instrutor = await teste.comoInstrutor();

      const resposta = await app.inject({
        method: 'POST',
        url: '/alunos/fantasma/codigo-de-redefinicao',
        headers: instrutor,
      });

      expect(resposta.statusCode).toBe(404);
    });
  });

  describe('DELETE /conta', () => {
    it('o aluno exclui a própria conta com a senha; o token e o login deixam de valer', async () => {
      const instrutor = await teste.comoInstrutor();
      const aluno = await teste.comoAluno();

      const exclusao = await app.inject({
        method: 'DELETE',
        url: '/conta',
        headers: aluno.headers,
        payload: { senha: aluno.senha },
      });

      expect(exclusao.statusCode).toBe(204);
      expect((await entrar(aluno.email, aluno.senha)).statusCode).toBe(401);
      const depois = await app.inject({ method: 'GET', url: '/minhas-aulas', headers: aluno.headers });
      expect(depois.statusCode).toBe(401);
      const alunos = await app.inject({ method: 'GET', url: '/alunos', headers: instrutor });
      expect(alunos.json()).toEqual({
        alunos: [{ id: aluno.alunoId, nome: 'Aluno removido', email: null, saldo: 0 }],
      });
    });

    it('senha errada: 403 e nada muda; instrutor não usa esta rota: 403', async () => {
      const aluno = await teste.comoAluno();
      const instrutor = await teste.comoInstrutor();

      const errada = await app.inject({
        method: 'DELETE',
        url: '/conta',
        headers: aluno.headers,
        payload: { senha: 'chute' },
      });
      const doInstrutor = await app.inject({
        method: 'DELETE',
        url: '/conta',
        headers: instrutor,
        payload: { senha: 'senha-do-instrutor' },
      });

      expect(errada.statusCode).toBe(403);
      expect(doInstrutor.statusCode).toBe(403);
      expect((await entrar(aluno.email, aluno.senha)).statusCode).toBe(201);
    });
  });

  describe('GET /minhas-aulas', () => {
    it('o aluno vê as próprias aulas e o saldo, e não as de outro aluno', async () => {
      const instrutor = await teste.comoInstrutor();
      const ana = await teste.comoAluno('Ana');
      const bia = await teste.comoAluno('Bia');
      await app.inject({
        method: 'POST',
        url: `/alunos/${ana.alunoId}/pacote`,
        headers: instrutor,
        payload: { quantidade: 3 },
      });
      await app.inject({
        method: 'POST',
        url: '/disponibilidades',
        headers: instrutor,
        payload: { inicios: [H10] },
      });
      await app.inject({ method: 'POST', url: '/aulas', headers: ana.headers, payload: { inicio: H10 } });

      const daAna = await app.inject({ method: 'GET', url: '/minhas-aulas', headers: ana.headers });
      const daBia = await app.inject({ method: 'GET', url: '/minhas-aulas', headers: bia.headers });

      expect(daAna.statusCode).toBe(200);
      expect(daAna.json()).toMatchObject({
        saldo: 2,
        aulas: [{ alunoId: ana.alunoId, inicio: H10, status: 'reservada' }],
      });
      expect(daBia.json()).toEqual({ saldo: 0, aulas: [] });
    });

    it('é só do aluno: instrutor recebe 403', async () => {
      const instrutor = await teste.comoInstrutor();

      const resposta = await app.inject({ method: 'GET', url: '/minhas-aulas', headers: instrutor });

      expect(resposta.statusCode).toBe(403);
    });
  });
});
