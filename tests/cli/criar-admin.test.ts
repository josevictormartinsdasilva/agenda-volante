import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { criarAdminPeloTerminal } from '../../src/cli/criar-admin.js';
import { criarTerminal, type Terminal } from '../../src/cli/terminal.js';
import { criarAmbiente } from '../helpers.js';

/** Terminal de mentira: responde na ordem e guarda tudo o que foi perguntado e escrito. */
function terminalComRespostas(...respostas: string[]) {
  const perguntas: Array<{ texto: string; oculto: boolean }> = [];
  let escrito = '';
  const terminal: Terminal = {
    async perguntar(texto, { oculto = false } = {}) {
      perguntas.push({ texto, oculto });
      return respostas.shift() ?? '';
    },
    escrever: (texto) => {
      escrito += texto;
    },
    fechar: () => {},
  };
  return { terminal, perguntas, escrito: () => escrito };
}

describe('comando criar-admin', () => {
  it('cria o administrador, que entra com o papel admin; a senha é pedida oculta e duas vezes', async () => {
    const { autenticacao } = criarAmbiente();
    const t = terminalComRespostas(' Admin@Exemplo.com ', 'senha-do-admin', 'senha-do-admin');

    const codigo = await criarAdminPeloTerminal(autenticacao, t.terminal);

    expect(codigo).toBe(0);
    expect(t.perguntas.map((p) => p.oculto)).toEqual([false, true, true]);
    expect(t.escrito()).toBe('Administrador admin@exemplo.com criado.\n');
    await expect(
      autenticacao.entrar({ email: 'admin@exemplo.com', senha: 'senha-do-admin' }),
    ).resolves.toMatchObject({ papel: 'admin' });
  });

  it.each([
    ['e-mail sem arroba', ['admin', 'senha-do-admin', 'senha-do-admin'], 'E-mail inválido.\n'],
    ['senha curta', ['admin@exemplo.com', '1234567', '1234567'], 'A senha precisa ter de 8 a 128 caracteres.\n'],
    ['confirmação diferente', ['admin@exemplo.com', 'senha-do-admin', 'senha-do-adm1n'], 'As senhas não conferem.\n'],
  ])('recusa %s, sai com código 1 e não cria a conta', async (_caso, respostas, mensagem) => {
    const { autenticacao, repositorios } = criarAmbiente();
    const t = terminalComRespostas(...respostas);

    expect(await criarAdminPeloTerminal(autenticacao, t.terminal)).toBe(1);

    expect(t.escrito()).toBe(mensagem);
    expect(await repositorios.usuarios.listarPorPapel('admin')).toEqual([]);
  });

  it('recusa e-mail que já tem conta', async () => {
    const { autenticacao } = criarAmbiente();
    await autenticacao.cadastrarInstrutor({ email: 'admin@exemplo.com', senha: 'senha-qualquer' });
    const t = terminalComRespostas('admin@exemplo.com', 'senha-do-admin', 'senha-do-admin');

    expect(await criarAdminPeloTerminal(autenticacao, t.terminal)).toBe(1);
    expect(t.escrito()).toBe('Já existe uma conta com esse e-mail.\n');
  });

  it('repassa erro inesperado em vez de escondê-lo', async () => {
    const falha = new Error('banco fora');
    const t = terminalComRespostas('admin@exemplo.com', 'senha-do-admin', 'senha-do-admin');

    await expect(
      criarAdminPeloTerminal({ criarAdmin: () => Promise.reject(falha) }, t.terminal),
    ).rejects.toBe(falha);
  });
});

describe('terminal sobre streams', () => {
  it('responde na ordem as linhas que chegaram por pipe, antes mesmo das perguntas', async () => {
    const entrada = new PassThrough();
    const saida = new PassThrough();
    entrada.end('admin@exemplo.com\nsenha-do-admin\n');
    const terminal = criarTerminal({ entrada, saida, interativo: false });

    expect(await terminal.perguntar('E-mail: ')).toBe('admin@exemplo.com');
    expect(await terminal.perguntar('Senha: ', { oculto: true })).toBe('senha-do-admin');
    await expect(terminal.perguntar('Mais: ')).rejects.toThrow(/terminou antes/);
    terminal.fechar();
  });

  it('com uma pessoa digitando, ecoa o e-mail mas não a senha', async () => {
    const entrada = new PassThrough();
    const saida = new PassThrough();
    let tela = '';
    saida.on('data', (pedaco: Buffer) => {
      tela += pedaco.toString();
    });
    const terminal = criarTerminal({ entrada, saida, interativo: true });

    const email = terminal.perguntar('E-mail: ');
    entrada.write('admin@exemplo.com\n');
    expect(await email).toBe('admin@exemplo.com');

    const senha = terminal.perguntar('Senha: ', { oculto: true });
    entrada.write('senha-secreta\n');
    expect(await senha).toBe('senha-secreta');

    terminal.escrever('pronto\n');
    terminal.fechar();
    expect(tela).toContain('E-mail: ');
    expect(tela).toContain('admin@exemplo.com');
    expect(tela).toContain('Senha: ');
    expect(tela).toContain('pronto');
    expect(tela).not.toContain('senha-secreta');
  });
});
