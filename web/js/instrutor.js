// Telas do instrutor: agenda do dia, publicar horários, alunos (pacote e código) e conta.

import { HORAS_DA_GRADE, inicioNoDia, montarDia, repetirNasSemanas } from './agenda.js';
import { telaConta } from './conta.js';
import { dataHoraEmFortaleza, diaEmFortaleza, horaEmFortaleza, proximosDias } from './datas.js';
import { api, el, estado, formulario, mensagemDe, navegacao, recarregar, seletorDeDias } from './ui.js';

/** @typedef {import('./agenda.js').Aula} Aula */
/** @typedef {import('./ui.js').Filho} Filho */
/** @typedef {{ id: string, nome: string, email: string | null, saldo: number }} AlunoDaLista */

/** @type {Array<[string, string]>} */
const ITENS = [
  ['#/agenda', 'Agenda'],
  ['#/horarios', 'Horários'],
  ['#/alunos', 'Alunos'],
  ['#/conta', 'Conta'],
];

/** Dia aberto na agenda e na tela de horários (AAAA-MM-DD, em Fortaleza). */
let diaDaAgenda = '';
let diaDosHorarios = '';

/** @returns {Promise<AlunoDaLista[]>} */
async function listarAlunos() {
  /** @type {{ alunos: AlunoDaLista[] }} */
  const { alunos } = await api.chamar('GET', '/alunos');
  return alunos;
}

/**
 * O que está publicado e reservado num dia.
 * @param {string} dia
 * @returns {Promise<{ livres: string[], aulas: Aula[] }>}
 */
async function carregarDia(dia) {
  const data = encodeURIComponent(dia);
  const [{ horarios: livres }, { aulas }] = await Promise.all([
    api.chamar('GET', `/horarios-livres?data=${data}`),
    api.chamar('GET', `/agenda?data=${data}`),
  ]);
  return { livres, aulas };
}

// ---------------------------------------------------------------- agenda do dia

/** @returns {Promise<Filho[]>} */
async function telaAgenda() {
  const hoje = diaEmFortaleza(new Date());
  const dias = proximosDias(new Date(), 14);
  if (!dias.includes(diaDaAgenda)) diaDaAgenda = hoje;

  const erro = el('p', { class: 'erro', role: 'alert' });
  const resumo = el('p', { class: 'suave' });
  const lista = el('ul', { class: 'lista' });
  const alunos = await listarAlunos();
  const nomes = new Map(alunos.map((aluno) => [aluno.id, aluno.nome]));

  async function carregar() {
    erro.textContent = '';
    lista.replaceChildren(el('li', { class: 'suave' }, 'Carregando…'));
    try {
      const { livres, aulas } = await carregarDia(diaDaAgenda);
      const horarios = montarDia(livres, aulas, nomes);
      resumo.textContent = `${aulas.length} ${aulas.length === 1 ? 'aula' : 'aulas'} · ${livres.length} ${livres.length === 1 ? 'horário livre' : 'horários livres'}`;
      lista.replaceChildren(
        ...(horarios.length === 0
          ? [el('li', { class: 'suave' }, 'Nada publicado neste dia. Publique em "Horários".')]
          : horarios.map((horario) =>
              horario.situacao === 'reservada' ? itemReservado(horario) : itemLivre(horario.inicio),
            )),
      );
    } catch (falha) {
      lista.replaceChildren();
      erro.textContent = mensagemDe(falha);
    }
  }

  /** @param {import('./agenda.js').HorarioReservado} horario */
  function itemReservado(horario) {
    async function cancelar() {
      const quando = dataHoraEmFortaleza(horario.inicio);
      if (!window.confirm(`Cancelar a aula de ${horario.aluno} em ${quando}?`)) return;
      try {
        const { creditoDevolvido } = await api.chamar(
          'POST',
          `/aulas/${encodeURIComponent(horario.aula.id)}/cancelar`,
        );
        estado.aviso = `Aula de ${horario.aluno} cancelada. ${
          creditoDevolvido ? 'O crédito voltou para o pacote.' : 'Com menos que o prazo mínimo, o crédito foi consumido.'
        }`;
      } catch (falha) {
        estado.aviso = mensagemDe(falha);
      }
      recarregar();
    }
    return el(
      'li',
      {},
      el('span', {}, el('strong', {}, horaEmFortaleza(horario.inicio)), ` · ${horario.aluno}`),
      el('button', { type: 'button', class: 'secundario', onclick: () => void cancelar() }, 'Cancelar'),
    );
  }

  /** @param {string} inicio */
  function itemLivre(inicio) {
    const comSaldo = alunos.filter((aluno) => aluno.saldo > 0);
    const escolha = /** @type {HTMLSelectElement} */ (
      el(
        'select',
        { 'aria-label': `Aluno para ${horaEmFortaleza(inicio)}` },
        el('option', { value: '' }, 'Marcar para…'),
        comSaldo.map((aluno) => el('option', { value: aluno.id }, `${aluno.nome} (${aluno.saldo})`)),
      )
    );
    async function marcar() {
      const aluno = comSaldo.find((a) => a.id === escolha.value);
      if (!aluno) return;
      try {
        await api.chamar('POST', '/aulas', { alunoId: aluno.id, inicio });
        estado.aviso = `Aula marcada para ${aluno.nome}: ${dataHoraEmFortaleza(inicio)}.`;
      } catch (falha) {
        estado.aviso = mensagemDe(falha);
      }
      recarregar();
    }
    escolha.addEventListener('change', () => void marcar());
    return el(
      'li',
      {},
      el('span', { class: 'suave' }, el('strong', {}, horaEmFortaleza(inicio)), ' · Livre'),
      comSaldo.length > 0 && escolha,
    );
  }

  await carregar();
  return [
    el('h1', {}, 'Agenda'),
    seletorDeDias({
      dias,
      hoje,
      escolhido: diaDaAgenda,
      aoEscolher: (dia) => {
        diaDaAgenda = dia;
        void carregar();
      },
    }),
    resumo,
    erro,
    lista,
    navegacao(ITENS, '#/agenda'),
  ];
}

// ---------------------------------------------------------------- publicar horários

/** @returns {Promise<Filho[]>} */
async function telaHorarios() {
  const hoje = diaEmFortaleza(new Date());
  const dias = proximosDias(new Date(), 28);
  if (!dias.includes(diaDosHorarios)) diaDosHorarios = hoje;

  /** Horários marcados para publicar (ISO). */
  const escolhidos = new Set();
  const erro = el('p', { class: 'erro', role: 'alert' });
  const grade = el('div', { class: 'horarios' });
  const semanas = /** @type {HTMLInputElement} */ (
    el('input', { type: 'number', min: 0, max: 8, value: 0, inputmode: 'numeric', name: 'semanas' })
  );
  const publicar = /** @type {HTMLButtonElement} */ (
    el('button', { type: 'button', disabled: true, onclick: () => void enviar() }, 'Publicar')
  );

  function atualizarBotao() {
    publicar.disabled = escolhidos.size === 0;
    publicar.textContent = escolhidos.size === 0 ? 'Publicar' : `Publicar ${escolhidos.size} ${escolhidos.size === 1 ? 'horário' : 'horários'}`;
  }

  async function carregar() {
    erro.textContent = '';
    escolhidos.clear();
    atualizarBotao();
    grade.replaceChildren(el('p', { class: 'suave' }, 'Carregando…'));
    try {
      const { livres, aulas } = await carregarDia(diaDosHorarios);
      const publicados = new Set(livres);
      const reservados = new Set(aulas.map((aula) => aula.inicio));
      const agora = Date.now();
      grade.replaceChildren(
        ...HORAS_DA_GRADE.map((hora) => {
          const inicio = inicioNoDia(diaDosHorarios, hora);
          const rotulo = `${String(hora).padStart(2, '0')}:00`;
          if (reservados.has(inicio)) return el('button', { type: 'button', disabled: true, class: 'reservado' }, rotulo, el('small', {}, 'Reservado'));
          if (publicados.has(inicio)) return el('button', { type: 'button', disabled: true, class: 'publicado' }, rotulo, el('small', {}, 'Publicado'));
          if (Date.parse(inicio) <= agora) return el('button', { type: 'button', disabled: true, class: 'passou' }, rotulo);
          return el(
            'button',
            {
              type: 'button',
              class: 'escolha',
              'aria-pressed': 'false',
              onclick: (/** @type {Event} */ evento) => {
                const botao = /** @type {HTMLElement} */ (evento.currentTarget);
                if (escolhidos.has(inicio)) escolhidos.delete(inicio);
                else escolhidos.add(inicio);
                botao.setAttribute('aria-pressed', String(escolhidos.has(inicio)));
                atualizarBotao();
              },
            },
            rotulo,
          );
        }),
      );
    } catch (falha) {
      grade.replaceChildren();
      erro.textContent = mensagemDe(falha);
    }
  }

  async function enviar() {
    const repeticoes = Math.min(8, Math.max(0, Number(semanas.value) || 0));
    const inicios = repetirNasSemanas([...escolhidos].sort(), repeticoes);
    publicar.disabled = true;
    try {
      await api.chamar('POST', '/disponibilidades', { inicios });
      estado.aviso =
        repeticoes === 0
          ? `${inicios.length} ${inicios.length === 1 ? 'horário publicado' : 'horários publicados'}.`
          : `${inicios.length} horários publicados (este dia e as ${repeticoes} ${repeticoes === 1 ? 'semana seguinte' : 'semanas seguintes'}).`;
      recarregar();
    } catch (falha) {
      erro.textContent = mensagemDe(falha);
      atualizarBotao();
    }
  }

  await carregar();
  return [
    el('h1', {}, 'Publicar horários'),
    el('p', { class: 'suave' }, 'Escolha o dia e toque nas horas em que você pode dar aula.'),
    seletorDeDias({
      dias,
      hoje,
      escolhido: diaDosHorarios,
      aoEscolher: (dia) => {
        diaDosHorarios = dia;
        void carregar();
      },
    }),
    erro,
    grade,
    el('label', { class: 'em-linha' }, 'Repetir nas próximas semanas:', semanas),
    publicar,
    el('p', { class: 'suave' }, 'Horário publicado ainda não pode ser retirado por aqui.'),
    navegacao(ITENS, '#/horarios'),
  ];
}

// ---------------------------------------------------------------- alunos

/** @returns {Promise<Filho[]>} */
async function telaAlunos() {
  const alunos = await listarAlunos();
  const filtro = /** @type {HTMLInputElement} */ (
    el('input', { type: 'search', placeholder: 'Buscar por nome ou e-mail', 'aria-label': 'Buscar aluno' })
  );

  /** @param {AlunoDaLista} aluno */
  function cartao(aluno) {
    const areaDoCodigo = el('div', { class: 'codigo', 'aria-live': 'polite' });

    async function gerarCodigo() {
      try {
        /** @type {{ codigo: string, expiraEm: string }} */
        const { codigo, expiraEm } = await api.chamar(
          'POST',
          `/alunos/${encodeURIComponent(aluno.id)}/codigo-de-redefinicao`,
        );
        const mensagem =
          `Olá, ${aluno.nome}! Seu código para criar uma senha nova na Agenda Volante é ${codigo}. ` +
          `Ele vale até ${horaEmFortaleza(expiraEm)} e serve uma vez só. Use em "Esqueci a senha".`;
        areaDoCodigo.replaceChildren(
          el('p', {}, 'Código: ', el('strong', { class: 'codigo-valor' }, codigo)),
          el('p', { class: 'suave' }, `Vale até ${horaEmFortaleza(expiraEm)}. Mande só para ${aluno.nome}.`),
          el(
            'a',
            {
              class: 'botao',
              href: `https://wa.me/?text=${encodeURIComponent(mensagem)}`,
              target: '_blank',
              rel: 'noopener noreferrer',
            },
            'Enviar pelo WhatsApp',
          ),
        );
      } catch (falha) {
        areaDoCodigo.replaceChildren(el('p', { class: 'erro' }, mensagemDe(falha)));
      }
    }

    return el(
      'li',
      { class: 'cartao-aluno', 'data-busca': `${aluno.nome} ${aluno.email ?? ''}`.toLowerCase() },
      el(
        'div',
        { class: 'cabecalho-aluno' },
        el('div', {}, el('strong', {}, aluno.nome), el('div', { class: 'suave' }, aluno.email ?? 'sem conta de acesso')),
        el('div', { class: 'saldo-pequeno', title: 'Aulas no pacote' }, String(aluno.saldo)),
      ),
      el(
        'details',
        {},
        el('summary', {}, 'Registrar pacote'),
        formulario(
          [{ nome: 'quantidade', rotulo: 'Quantas aulas foram vendidas', tipo: 'number', menorValor: 1, valor: '10' }],
          'Registrar',
          async ({ quantidade }) => {
            /** @type {{ saldo: number }} */
            const { saldo } = await api.chamar('POST', `/alunos/${encodeURIComponent(aluno.id)}/pacote`, {
              quantidade: Number(quantidade),
            });
            estado.aviso = `Pacote registrado: ${aluno.nome} agora tem ${saldo} ${saldo === 1 ? 'aula' : 'aulas'}.`;
            recarregar();
          },
        ),
      ),
      aluno.email !== null &&
        el(
          'details',
          {},
          el('summary', {}, 'Esqueceu a senha?'),
          el('p', { class: 'suave' }, 'Gere um código de uso único e mande para o aluno. Você não vê nem define a senha dele.'),
          el('button', { type: 'button', class: 'secundario', onclick: () => void gerarCodigo() }, 'Gerar código'),
          areaDoCodigo,
        ),
    );
  }

  const lista = el(
    'ul',
    { class: 'lista lista-alunos' },
    alunos.length === 0 ? el('li', { class: 'suave' }, 'Nenhum aluno cadastrado ainda.') : alunos.map(cartao),
  );
  filtro.addEventListener('input', () => {
    const termo = filtro.value.trim().toLowerCase();
    for (const item of lista.querySelectorAll('li[data-busca]')) {
      /** @type {HTMLElement} */ (item).hidden = !item.getAttribute('data-busca')?.includes(termo);
    }
  });

  return [
    el('h1', {}, 'Alunos'),
    el('p', { class: 'suave' }, 'O aluno cria a própria conta em "Ainda não tenho conta". Depois, registre aqui o pacote vendido.'),
    alunos.length > 5 && filtro,
    lista,
    navegacao(ITENS, '#/alunos'),
  ];
}

/** @type {Record<string, () => Promise<Filho[]>>} */
export const telasDoInstrutor = {
  '#/agenda': telaAgenda,
  '#/horarios': telaHorarios,
  '#/alunos': telaAlunos,
  '#/conta': () => telaConta({ papel: 'instrutor', itensDeNavegacao: ITENS }),
};
