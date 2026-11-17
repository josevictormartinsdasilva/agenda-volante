// Telas sem login: entrar, criar conta e redefinir a senha com o código do instrutor.

import { api, el, estado, formulario, irPara } from './ui.js';

/** Para onde cada papel vai depois de entrar. */
export const INICIO_POR_PAPEL = { aluno: '#/inicio', instrutor: '#/agenda', admin: '#/admin' };

/** @returns {Promise<import('./ui.js').Filho[]>} */
export async function telaEntrar() {
  return [
    el('h1', {}, 'Entrar'),
    formulario(
      [
        { nome: 'email', rotulo: 'E-mail', tipo: 'email', autocomplete: 'email' },
        { nome: 'senha', rotulo: 'Senha', tipo: 'password', autocomplete: 'current-password' },
      ],
      'Entrar',
      async ({ email, senha }) => {
        /** @type {{ papel: keyof typeof INICIO_POR_PAPEL }} */
        const sessao = await api.chamar('POST', '/sessoes', { email, senha });
        irPara(INICIO_POR_PAPEL[sessao.papel]);
      },
    ),
    el(
      'div',
      { class: 'links' },
      el('a', { href: '#/criar-conta' }, 'Ainda não tenho conta'),
      el('a', { href: '#/esqueci' }, 'Esqueci a senha'),
    ),
  ];
}

/** @returns {Promise<import('./ui.js').Filho[]>} */
export async function telaCriarConta() {
  return [
    el('h1', {}, 'Criar conta'),
    el('p', { class: 'suave' }, 'Depois do cadastro, o instrutor registra o seu pacote de aulas.'),
    formulario(
      [
        { nome: 'nome', rotulo: 'Nome', autocomplete: 'name' },
        { nome: 'email', rotulo: 'E-mail', tipo: 'email', autocomplete: 'email' },
        { nome: 'senha', rotulo: 'Senha (mínimo de 8 caracteres)', tipo: 'password', autocomplete: 'new-password', minimo: 8 },
      ],
      'Criar conta',
      async ({ nome, email, senha }) => {
        await api.chamar('POST', '/alunos', { nome, email, senha });
        await api.chamar('POST', '/sessoes', { email, senha });
        estado.aviso = 'Conta criada. Peça ao instrutor para registrar o seu pacote de aulas.';
        irPara('#/inicio');
      },
    ),
    el('div', { class: 'links' }, el('a', { href: '#/entrar' }, 'Já tenho conta')),
  ];
}

/** @returns {Promise<import('./ui.js').Filho[]>} */
export async function telaEsqueci() {
  return [
    el('h1', {}, 'Esqueci a senha'),
    el(
      'p',
      { class: 'suave' },
      'Peça ao instrutor um código de redefinição. Ele vale 1 hora e serve uma vez só.',
    ),
    formulario(
      [
        { nome: 'email', rotulo: 'E-mail', tipo: 'email', autocomplete: 'email' },
        { nome: 'codigo', rotulo: 'Código (ex.: K7QM-3XRA)', autocomplete: 'one-time-code' },
        { nome: 'novaSenha', rotulo: 'Senha nova (mínimo de 8 caracteres)', tipo: 'password', autocomplete: 'new-password', minimo: 8 },
      ],
      'Criar senha nova',
      async ({ email, codigo, novaSenha }) => {
        await api.chamar('POST', '/senha/redefinicao', { email, codigo, novaSenha });
        estado.aviso = 'Senha nova criada. Entre com ela.';
        irPara('#/entrar');
      },
    ),
    el('div', { class: 'links' }, el('a', { href: '#/entrar' }, 'Voltar')),
  ];
}
