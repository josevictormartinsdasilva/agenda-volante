import type { Autenticacao } from '../application/autenticacao.js';
import { EmailJaCadastrado } from '../domain/erros.js';
import type { Terminal } from './terminal.js';

/** Mesma regra do cadastro pela API: algo@algo.algo, sem espaços. */
const FORMATO_DE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Cria uma conta de administrador perguntando e-mail e senha no terminal. A senha é
 * digitada duas vezes e nunca aparece na tela nem em configuração. Devolve o código de
 * saída do processo (0 = criada).
 */
export async function criarAdminPeloTerminal(
  autenticacao: Pick<Autenticacao, 'criarAdmin'>,
  terminal: Terminal,
): Promise<number> {
  const email = (await terminal.perguntar('E-mail do administrador: ')).trim();
  if (!FORMATO_DE_EMAIL.test(email) || email.length > 254) {
    terminal.escrever('E-mail inválido.\n');
    return 1;
  }

  const senha = await terminal.perguntar('Senha (8 a 128 caracteres): ', { oculto: true });
  if (senha.length < 8 || senha.length > 128) {
    terminal.escrever('A senha precisa ter de 8 a 128 caracteres.\n');
    return 1;
  }
  if ((await terminal.perguntar('Repita a senha: ', { oculto: true })) !== senha) {
    terminal.escrever('As senhas não conferem.\n');
    return 1;
  }

  try {
    const conta = await autenticacao.criarAdmin({ email, senha });
    terminal.escrever(`Administrador ${conta.email} criado.\n`);
    return 0;
  } catch (erro) {
    if (erro instanceof EmailJaCadastrado) {
      terminal.escrever(`${erro.message}.\n`);
      return 1;
    }
    throw erro;
  }
}
