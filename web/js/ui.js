// Peças comuns a todas as telas: montar elementos, formulários, navegação e avisos.
//
// Regra para não abrir brecha de XSS: texto que vem da API ou do usuário entra sempre como
// texto (`append`, `textContent`), nunca como HTML.

import { criarApi } from './api.js';
import { rotuloDoDia } from './datas.js';

export const api = criarApi(window.fetch.bind(window));

/** @typedef {Node | string | null | undefined | false} Filho */

/** Mensagem a mostrar no topo da próxima tela (ex.: "Aula marcada"). */
export const estado = { aviso: '' };

/**
 * Cria um elemento. Atributos `on...` com função viram ouvintes de evento; `true` vira
 * atributo sem valor; `false`, `null` e `undefined` são ignorados.
 * @param {string} tag
 * @param {Record<string, unknown>} [atributos]
 * @param {...(Filho | Filho[])} filhos
 * @returns {HTMLElement}
 */
export function el(tag, atributos = {}, ...filhos) {
  const elemento = document.createElement(tag);
  for (const [nome, valor] of Object.entries(atributos)) {
    if (nome.startsWith('on') && typeof valor === 'function') {
      elemento.addEventListener(nome.slice(2), /** @type {EventListener} */ (valor));
    } else if (valor === true) {
      elemento.setAttribute(nome, '');
    } else if (valor !== false && valor !== null && valor !== undefined) {
      elemento.setAttribute(nome, String(valor));
    }
  }
  for (const filho of filhos.flat()) {
    if (filho !== null && filho !== undefined && filho !== false) elemento.append(filho);
  }
  return elemento;
}

/** @param {unknown} erro */
export function mensagemDe(erro) {
  return erro instanceof Error ? erro.message : 'Algo deu errado. Tente de novo.';
}

/**
 * @typedef {object} Campo
 * @property {string} nome
 * @property {string} rotulo
 * @property {string} [tipo] padrão: text
 * @property {string} [autocomplete]
 * @property {number} [minimo] tamanho mínimo do texto
 * @property {number} [menorValor] para tipo number
 * @property {string} [valor] valor inicial
 */

/**
 * Formulário com campos obrigatórios, botão que trava enquanto envia e área de erro.
 * @param {Campo[]} campos
 * @param {string} textoDoBotao
 * @param {(dados: Record<string, string>) => Promise<void>} aoEnviar
 * @param {{ perigo?: boolean }} [opcoes]
 * @returns {HTMLFormElement}
 */
export function formulario(campos, textoDoBotao, aoEnviar, opcoes = {}) {
  const erro = el('p', { class: 'erro', role: 'alert' });
  const botao = /** @type {HTMLButtonElement} */ (
    el('button', { type: 'submit', class: opcoes.perigo ? 'perigo' : undefined }, textoDoBotao)
  );
  const form = /** @type {HTMLFormElement} */ (
    el(
      'form',
      {},
      campos.map((campo) =>
        el(
          'label',
          {},
          campo.rotulo,
          el('input', {
            name: campo.nome,
            type: campo.tipo ?? 'text',
            autocomplete: campo.autocomplete,
            minlength: campo.minimo,
            min: campo.menorValor,
            inputmode: campo.tipo === 'number' ? 'numeric' : undefined,
            value: campo.valor,
            required: true,
          }),
        ),
      ),
      erro,
      botao,
    )
  );
  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    erro.textContent = '';
    botao.disabled = true;
    try {
      const dados = Object.fromEntries(
        [...new FormData(form)].map(([nome, valor]) => [nome, String(valor)]),
      );
      await aoEnviar(dados);
    } catch (falha) {
      erro.textContent = mensagemDe(falha);
    } finally {
      botao.disabled = false;
    }
  });
  return form;
}

/**
 * Barra de navegação das telas de quem está logado.
 * @param {Array<[hash: string, texto: string]>} itens
 * @param {string} atual
 */
export function navegacao(itens, atual) {
  return el(
    'nav',
    { class: 'navegacao', 'aria-label': 'Navegação' },
    itens.map(([hash, texto]) =>
      el('a', { href: hash, 'aria-current': hash === atual ? 'page' : undefined }, texto),
    ),
  );
}

/**
 * Faixa de dias para escolher (Hoje, Amanhã, qui., 19/11...).
 * @param {{ dias: string[], hoje: string, escolhido: string, aoEscolher: (dia: string) => void }} opcoes
 */
export function seletorDeDias({ dias, hoje, escolhido, aoEscolher }) {
  /** @type {HTMLElement[]} */
  const botoes = dias.map((dia) =>
    el(
      'button',
      {
        type: 'button',
        'aria-pressed': String(dia === escolhido),
        onclick: () => {
          for (const [i, botao] of botoes.entries()) botao.setAttribute('aria-pressed', String(dias[i] === dia));
          aoEscolher(dia);
        },
      },
      rotuloDoDia(dia, hoje),
    ),
  );
  return el('div', { class: 'dias', role: 'group', 'aria-label': 'Dia' }, botoes);
}

/** Mostra a tela atual de novo (depois de uma ação que muda os dados). */
export function recarregar() {
  window.dispatchEvent(new Event('agenda:recarregar'));
}

/** @param {string} hash */
export function irPara(hash) {
  if (location.hash === hash) recarregar();
  else location.hash = hash;
}
