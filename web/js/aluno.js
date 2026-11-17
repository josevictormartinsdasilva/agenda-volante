// Telas do aluno: saldo e próximas aulas, marcar aula e conta.

import { telaConta } from './conta.js';
import { dataHoraEmFortaleza, diaEmFortaleza, horaEmFortaleza, proximosDias } from './datas.js';
import { api, el, estado, irPara, mensagemDe, navegacao, recarregar, seletorDeDias } from './ui.js';

/** @typedef {import('./agenda.js').Aula} Aula */
/** @typedef {import('./ui.js').Filho} Filho */

/** @type {Array<[string, string]>} */
const ITENS = [
  ['#/inicio', 'Início'],
  ['#/marcar', 'Marcar'],
  ['#/conta', 'Conta'],
];

/** Dia escolhido na tela de marcar aula (AAAA-MM-DD, em Fortaleza). */
let diaEscolhido = '';

/** @returns {Promise<Filho[]>} */
async function telaInicio() {
  /** @type {{ saldo: number, aulas: Aula[] }} */
  const { saldo, aulas } = await api.chamar('GET', '/minhas-aulas');
  const agora = Date.now();
  const reservadas = aulas.filter((aula) => aula.status === 'reservada');
  const proximas = reservadas.filter((aula) => Date.parse(aula.inicio) > agora);
  const anteriores = reservadas.filter((aula) => Date.parse(aula.inicio) <= agora).reverse().slice(0, 5);

  /** @param {Aula} aula */
  async function cancelar(aula) {
    const quando = dataHoraEmFortaleza(aula.inicio);
    const certeza = window.confirm(
      `Cancelar a aula de ${quando}?\nSe faltar menos que o prazo mínimo de antecedência, o crédito não volta.`,
    );
    if (!certeza) return;
    try {
      const { creditoDevolvido } = await api.chamar('POST', `/aulas/${encodeURIComponent(aula.id)}/cancelar`);
      estado.aviso = creditoDevolvido
        ? 'Aula cancelada. O crédito voltou para o seu pacote.'
        : 'Aula cancelada. Como faltava menos que o prazo mínimo, o crédito foi consumido.';
    } catch (falha) {
      estado.aviso = mensagemDe(falha);
    }
    recarregar();
  }

  return [
    el(
      'section',
      { class: 'cartao' },
      el('div', { class: 'suave' }, 'Aulas no seu pacote'),
      el('div', { class: 'saldo' }, String(saldo)),
      saldo === 0 && el('p', { class: 'suave' }, 'Peça ao instrutor para registrar o seu pacote.'),
      saldo > 0 && el('a', { class: 'botao', href: '#/marcar' }, 'Marcar aula'),
    ),
    el('h2', {}, 'Próximas aulas'),
    proximas.length === 0
      ? el('p', { class: 'suave' }, 'Nenhuma aula marcada.')
      : el(
          'ul',
          { class: 'lista' },
          proximas.map((aula) =>
            el(
              'li',
              {},
              el('span', {}, dataHoraEmFortaleza(aula.inicio)),
              el('button', { type: 'button', class: 'secundario', onclick: () => cancelar(aula) }, 'Cancelar'),
            ),
          ),
        ),
    anteriores.length > 0 && el('h2', {}, 'Aulas anteriores'),
    anteriores.length > 0 &&
      el(
        'ul',
        { class: 'lista' },
        anteriores.map((aula) => el('li', {}, el('span', { class: 'suave' }, dataHoraEmFortaleza(aula.inicio)))),
      ),
    navegacao(ITENS, '#/inicio'),
  ];
}

/** @returns {Promise<Filho[]>} */
async function telaMarcar() {
  const hoje = diaEmFortaleza(new Date());
  const dias = proximosDias(new Date(), 14);
  if (!dias.includes(diaEscolhido)) diaEscolhido = hoje;

  const erro = el('p', { class: 'erro', role: 'alert' });
  const horarios = el('div', { class: 'horarios' });

  async function carregarHorarios() {
    horarios.replaceChildren(el('p', { class: 'suave' }, 'Carregando horários…'));
    erro.textContent = '';
    try {
      /** @type {{ horarios: string[] }} */
      const { horarios: livres } = await api.chamar(
        'GET',
        `/horarios-livres?data=${encodeURIComponent(diaEscolhido)}`,
      );
      horarios.replaceChildren(
        ...(livres.length === 0
          ? [el('p', { class: 'suave' }, 'Nenhum horário livre neste dia.')]
          : livres.map((inicio) =>
              el('button', { type: 'button', onclick: () => marcar(inicio) }, horaEmFortaleza(inicio)),
            )),
      );
    } catch (falha) {
      horarios.replaceChildren();
      erro.textContent = mensagemDe(falha);
    }
  }

  /** @param {string} inicio */
  async function marcar(inicio) {
    const quando = dataHoraEmFortaleza(inicio);
    if (!window.confirm(`Marcar aula ${quando}?\nUsa 1 crédito do seu pacote.`)) return;
    try {
      await api.chamar('POST', '/aulas', { inicio });
      estado.aviso = `Aula marcada: ${quando}.`;
      irPara('#/inicio');
    } catch (falha) {
      // Horário ocupado por outro aluno no meio do caminho, ou sem saldo: recarrega a lista.
      await carregarHorarios();
      erro.textContent = mensagemDe(falha);
    }
  }

  await carregarHorarios();
  return [
    el('h1', {}, 'Marcar aula'),
    seletorDeDias({
      dias,
      hoje,
      escolhido: diaEscolhido,
      aoEscolher: (dia) => {
        diaEscolhido = dia;
        void carregarHorarios();
      },
    }),
    erro,
    horarios,
    navegacao(ITENS, '#/marcar'),
  ];
}

/** @type {Record<string, () => Promise<Filho[]>>} */
export const telasDoAluno = {
  '#/inicio': telaInicio,
  '#/marcar': telaMarcar,
  '#/conta': () => telaConta({ papel: 'aluno', itensDeNavegacao: ITENS }),
};
