// Tela "Conta", comum a aluno e instrutor: trocar senha e sair; o aluno também exclui a conta.

import { api, el, estado, formulario, irPara, navegacao, recarregar } from './ui.js';

/**
 * @param {{ papel: 'aluno' | 'instrutor', itensDeNavegacao: Array<[string, string]> }} opcoes
 * @returns {Promise<import('./ui.js').Filho[]>}
 */
export async function telaConta({ papel, itensDeNavegacao }) {
  async function sair() {
    await api.chamar('DELETE', '/sessoes/atual');
    irPara('#/entrar');
  }

  return [
    el('h1', {}, 'Conta'),
    el('h2', {}, 'Trocar senha'),
    formulario(
      [
        { nome: 'senhaAtual', rotulo: 'Senha atual', tipo: 'password', autocomplete: 'current-password' },
        { nome: 'novaSenha', rotulo: 'Senha nova (mínimo de 8 caracteres)', tipo: 'password', autocomplete: 'new-password', minimo: 8 },
      ],
      'Trocar senha',
      async ({ senhaAtual, novaSenha }) => {
        await api.chamar('POST', '/conta/senha', { senhaAtual, novaSenha });
        estado.aviso = 'Senha trocada. As outras sessões foram encerradas.';
        recarregar();
      },
    ),
    el('h2', {}, 'Sessão'),
    el('button', { type: 'button', class: 'secundario', onclick: () => void sair() }, 'Sair'),
    papel === 'aluno' &&
      el(
        'details',
        {},
        el('summary', {}, 'Excluir minha conta'),
        el(
          'p',
          { class: 'suave' },
          'Seu e-mail, sua senha e seu nome são apagados, e as aulas marcadas são canceladas. ' +
            'Os créditos que sobrarem no pacote não voltam pelo sistema: combine com o instrutor.',
        ),
        formulario(
          [{ nome: 'senha', rotulo: 'Confirme com a sua senha', tipo: 'password', autocomplete: 'current-password' }],
          'Excluir conta',
          async ({ senha }) => {
            if (!window.confirm('Excluir a sua conta? Isso não tem volta.')) return;
            await api.chamar('DELETE', '/conta', { senha });
            estado.aviso = 'Conta excluída.';
            irPara('#/entrar');
          },
          { perigo: true },
        ),
      ),
    navegacao(itensDeNavegacao, '#/conta'),
  ];
}
