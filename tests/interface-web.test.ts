import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { criarAmbiente, criarApp } from './helpers.js';

describe('interface web servida pela API', () => {
  let app: FastifyInstance;
  afterEach(() => app.close());

  it('GET / entrega a página com cabeçalhos de segurança', async () => {
    app = criarApp().app;

    const resposta = await app.inject({ method: 'GET', url: '/' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['content-type']).toContain('text/html');
    expect(resposta.body).toContain('<main id="app"');
    const csp = String(resposta.headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(resposta.headers['x-content-type-options']).toBe('nosniff');
    expect(resposta.headers['referrer-policy']).toBe('no-referrer');
  });

  it('entrega os scripts e o estilo com o tipo certo', async () => {
    app = criarApp().app;

    const script = await app.inject({ method: 'GET', url: '/js/app.js' });
    const estilo = await app.inject({ method: 'GET', url: '/estilo.css' });

    expect(script.statusCode).toBe(200);
    expect(script.headers['content-type']).toContain('javascript');
    expect(estilo.headers['content-type']).toContain('text/css');
  });

  it('não serve nada fora da pasta web', async () => {
    app = criarApp().app;

    for (const url of ['/../package.json', '/js/../../package.json', '/%2e%2e/package.json', '/.env']) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
    }
  });
});

describe('sessão por cookie (navegador)', () => {
  let app: FastifyInstance;
  afterEach(() => app.close());

  const ANA = { nome: 'Ana', email: 'ana@exemplo.com', senha: 'senha-da-ana' };

  async function login(teste: ReturnType<typeof criarApp>) {
    await teste.app.inject({ method: 'POST', url: '/alunos', payload: ANA });
    return teste.app.inject({
      method: 'POST',
      url: '/sessoes',
      payload: { email: ANA.email, senha: ANA.senha },
    });
  }

  /** O valor `sessao=...` do Set-Cookie, pronto para o cabeçalho Cookie. */
  function cookieDe(setCookie: string | string[] | undefined): string {
    return String(setCookie).split(';')[0] ?? '';
  }

  it('o login grava o token num cookie HttpOnly, SameSite=Strict e Secure, com a validade da sessão', async () => {
    const teste = criarApp();
    app = teste.app;

    const resposta = await login(teste);

    const setCookie = String(resposta.headers['set-cookie']);
    expect(setCookie).toMatch(/^sessao=[A-Za-z0-9_-]{43};/);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('Max-Age=86400'); // 24 h no ambiente de teste
    expect(setCookie).toContain('Secure');
  });

  it('o cookie identifica o aluno sem cabeçalho Authorization, mesmo entre outros cookies', async () => {
    const teste = criarApp();
    app = teste.app;
    const cookie = cookieDe((await login(teste)).headers['set-cookie']);

    const resposta = await app.inject({
      method: 'GET',
      url: '/minhas-aulas',
      headers: { cookie: `tema=escuro; ${cookie}; idioma=pt` },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ saldo: 0, aulas: [] });
  });

  it('cookie com token inventado ou vazio: 401', async () => {
    app = criarApp().app;

    for (const cookie of ['sessao=inventado', 'sessao=', 'outro=1']) {
      const resposta = await app.inject({ method: 'GET', url: '/minhas-aulas', headers: { cookie } });
      expect(resposta.statusCode).toBe(401);
    }
  });

  it('o logout encerra a sessão e apaga o cookie', async () => {
    const teste = criarApp();
    app = teste.app;
    const cookie = cookieDe((await login(teste)).headers['set-cookie']);

    const saida = await app.inject({ method: 'DELETE', url: '/sessoes/atual', headers: { cookie } });
    const depois = await app.inject({ method: 'GET', url: '/minhas-aulas', headers: { cookie } });

    expect(saida.statusCode).toBe(204);
    expect(String(saida.headers['set-cookie'])).toMatch(/^sessao=;.*Max-Age=0/);
    expect(depois.statusCode).toBe(401);
  });

  it('excluir a conta também apaga o cookie', async () => {
    const teste = criarApp();
    app = teste.app;
    const cookie = cookieDe((await login(teste)).headers['set-cookie']);

    const exclusao = await app.inject({
      method: 'DELETE',
      url: '/conta',
      headers: { cookie },
      payload: { senha: ANA.senha },
    });

    expect(exclusao.statusCode).toBe(204);
    expect(String(exclusao.headers['set-cookie'])).toMatch(/^sessao=;.*Max-Age=0/);
  });

  it('com COOKIE_SEGURO=false (desenvolvimento em http), o cookie sai sem Secure', async () => {
    const ambiente = criarAmbiente();
    app = buildApp(
      { logLevel: 'silent', cookieSeguro: false, sessaoDuracaoHoras: 24 },
      ambiente.casos,
      ambiente.autenticacao,
    );
    await app.inject({ method: 'POST', url: '/alunos', payload: ANA });

    const resposta = await app.inject({
      method: 'POST',
      url: '/sessoes',
      payload: { email: ANA.email, senha: ANA.senha },
    });

    expect(String(resposta.headers['set-cookie'])).not.toContain('Secure');
  });

  it('o cabeçalho Authorization continua valendo e tem precedência sobre o cookie', async () => {
    const teste = criarApp();
    app = teste.app;
    const instrutor = await teste.comoInstrutor();
    const cookieDoAluno = cookieDe((await login(teste)).headers['set-cookie']);

    // Com o token do instrutor no cabeçalho, quem fala é o instrutor (403 em rota de aluno).
    const resposta = await app.inject({
      method: 'GET',
      url: '/minhas-aulas',
      headers: { ...instrutor, cookie: cookieDoAluno },
    });

    expect(resposta.statusCode).toBe(403);
  });
});
