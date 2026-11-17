// Interface do aluno: uma página só, com as telas trocadas pelo endereço (#/inicio,
// #/marcar...). Sem framework e sem etapa de build (ADR 0006).
//
// Regra para não abrir brecha de XSS: texto que vem da API ou do usuário entra sempre como
// texto (`append`, `textContent`), nunca como HTML.

import { criarApi, ErroDaApi } from './api.js';
import { dataHoraEmFortaleza, diaEmFortaleza, horaEmFortaleza, proximosDias, rotuloDoDia } from './datas.js';

const api = criarApi(window.fetch.bind(window));
const raiz = /** @type {HTMLElement} */ (document.getElementById('app'));

/** @typedef {{ id: string, alunoId: string, inicio: string, fim: string, status: 'reservada' | 'cancelada' }} Aula */
/** @typedef {Node | string | null | undefined | false} Filho */

/** Mensagem a mostrar no topo da próxima tela (ex.: "Aula marcada"). */
let avisoPendente = '';
/** Dia escolhido na tela de marcar aula (AAAA-MM-DD, em Fortaleza). */
let diaEscolhido = '';

// ---------------------------------------------------------------- utilidades de tela

/**
 * Cria um elemento. Atributos `on...` com função viram ouvintes de evento; `true` vira
 * atributo sem valor; `false`, `null` e `undefined` são ignorados.
 * @param {string} tag
 * @param {Record<string, unknown>} [atributos]
 * @param {...(Filho | Filho[])} filhos
 * @returns {HTMLElement}
 */
function el(tag, atributos = {}, ...filhos) {
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
function mensagemDe(erro) {
  return erro instanceof Error ? erro.message : 'Algo deu errado. Tente de novo.';
}

/**
 * @typedef {{ nome: string, rotulo: string, tipo?: string, autocomplete?: string, minimo?: number }} Campo
 */

/**
 * Formulário com campos obrigatórios, botão que trava enquanto envia e área de erro.
 * @param {Campo[]} campos
 * @param {string} textoDoBotao
 * @param {(dados: Record<string, string>) => Promise<void>} aoEnviar
 * @param {{ perigo?: boolean }} [opcoes]
 */
function formulario(campos, textoDoBotao, aoEnviar, opcoes = {}) {
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
 * @param {string} atual
 */
function navegacao(atual) {
  const item = (/** @type {string} */ hash, /** @type {string} */ texto) =>
    el('a', { href: hash, 'aria-current': hash === atual ? 'page' : undefined }, texto);
  return el(
    'nav',
    { class: 'navegacao', 'aria-label': 'Navegação' },
    item('#/inicio', 'Início'),
    item('#/marcar', 'Marcar'),
    item('#/conta', 'Conta'),
  );
}

/** @param {string} hash */
function irPara(hash) {
  if (location.hash === hash) void mostrar();
  else location.hash = hash;
}

// ---------------------------------------------------------------- telas sem login

/** @returns {Promise<Filho[]>} */
async function telaEntrar() {
  return [
    el('h1', {}, 'Entrar'),
    formulario(
      [
        { nome: 'email', rotulo: 'E-mail', tipo: 'email', autocomplete: 'email' },
        { nome: 'senha', rotulo: 'Senha', tipo: 'password', autocomplete: 'current-password' },
      ],
      'Entrar',
      async ({ email, senha }) => {
        const sessao = await api.chamar('POST', '/sessoes', { email, senha });
        if (sessao.papel !== 'aluno') {
          await api.chamar('DELETE', '/sessoes/atual');
          throw new Error('Esta tela é para alunos. Instrutor e administrador usam a API por enquanto.');
        }
        irPara('#/inicio');
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

/** @returns {Promise<Filho[]>} */
async function telaCriarConta() {
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
        avisoPendente = 'Conta criada. Peça ao instrutor para registrar o seu pacote de aulas.';
        irPara('#/inicio');
      },
    ),
    el('div', { class: 'links' }, el('a', { href: '#/entrar' }, 'Já tenho conta')),
  ];
}

/** @returns {Promise<Filho[]>} */
async function telaEsqueci() {
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
        avisoPendente = 'Senha nova criada. Entre com ela.';
        irPara('#/entrar');
      },
    ),
    el('div', { class: 'links' }, el('a', { href: '#/entrar' }, 'Voltar')),
  ];
}

// ---------------------------------------------------------------- telas do aluno

/**
 * Busca as aulas e o saldo; é também o que confirma que há um aluno logado
 * (401 leva ao login; instrutor e administrador recebem 403).
 * @returns {Promise<{ saldo: number, aulas: Aula[] }>}
 */
function minhasAulas() {
  return api.chamar('GET', '/minhas-aulas');
}

/** @returns {Promise<Filho[]>} */
async function telaInicio() {
  const { saldo, aulas } = await minhasAulas();
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
      avisoPendente = creditoDevolvido
        ? 'Aula cancelada. O crédito voltou para o seu pacote.'
        : 'Aula cancelada. Como faltava menos que o prazo mínimo, o crédito foi consumido.';
    } catch (falha) {
      avisoPendente = mensagemDe(falha);
    }
    void mostrar();
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
    navegacao('#/inicio'),
  ];
}

/** @returns {Promise<Filho[]>} */
async function telaMarcar() {
  await minhasAulas(); // confirma o login antes de montar a tela
  const hoje = diaEmFortaleza(new Date());
  const dias = proximosDias(new Date(), 14);
  if (!dias.includes(diaEscolhido)) diaEscolhido = hoje;

  const erro = el('p', { class: 'erro', role: 'alert' });
  const horarios = el('div', { class: 'horarios' });

  async function carregarHorarios() {
    horarios.replaceChildren(el('p', { class: 'suave' }, 'Carregando horários…'));
    erro.textContent = '';
    try {
      const { horarios: livres } = await api.chamar(
        'GET',
        `/horarios-livres?data=${encodeURIComponent(diaEscolhido)}`,
      );
      horarios.replaceChildren(
        ...(livres.length === 0
          ? [el('p', { class: 'suave' }, 'Nenhum horário livre neste dia.')]
          : livres.map((/** @type {string} */ inicio) =>
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
      avisoPendente = `Aula marcada: ${quando}.`;
      irPara('#/inicio');
    } catch (falha) {
      // Horário ocupado por outro aluno no meio do caminho, ou sem saldo: recarrega a lista.
      await carregarHorarios();
      erro.textContent = mensagemDe(falha);
    }
  }

  const botoesDosDias = dias.map((dia) =>
    el(
      'button',
      {
        type: 'button',
        'aria-pressed': String(dia === diaEscolhido),
        onclick: (/** @type {Event} */ evento) => {
          diaEscolhido = dia;
          for (const botao of botoesDosDias) botao.setAttribute('aria-pressed', String(botao === evento.currentTarget));
          void carregarHorarios();
        },
      },
      rotuloDoDia(dia, hoje),
    ),
  );

  await carregarHorarios();
  return [
    el('h1', {}, 'Marcar aula'),
    el('div', { class: 'dias', role: 'group', 'aria-label': 'Dia' }, botoesDosDias),
    erro,
    horarios,
    navegacao('#/marcar'),
  ];
}

/** @returns {Promise<Filho[]>} */
async function telaConta() {
  await minhasAulas(); // confirma o login antes de montar a tela

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
        avisoPendente = 'Senha trocada. As outras sessões foram encerradas.';
        void mostrar();
      },
    ),
    el('h2', {}, 'Sessão'),
    el('button', { type: 'button', class: 'secundario', onclick: () => void sair() }, 'Sair'),
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
          avisoPendente = 'Conta excluída.';
          irPara('#/entrar');
        },
        { perigo: true },
      ),
    ),
    navegacao('#/conta'),
  ];
}

// ---------------------------------------------------------------- roteamento

/** @type {Record<string, () => Promise<Filho[]>>} */
const telas = {
  '#/entrar': telaEntrar,
  '#/criar-conta': telaCriarConta,
  '#/esqueci': telaEsqueci,
  '#/inicio': telaInicio,
  '#/marcar': telaMarcar,
  '#/conta': telaConta,
};

async function mostrar() {
  const tela = telas[location.hash] ?? telaInicio;
  const aviso = avisoPendente;
  avisoPendente = '';
  try {
    const conteudo = await tela();
    raiz.replaceChildren(
      ...[aviso && el('p', { class: 'aviso', role: 'status' }, aviso), ...conteudo].filter(
        (filho) => filho !== null && filho !== undefined && filho !== false,
      ),
    );
    window.scrollTo(0, 0);
  } catch (falha) {
    if (falha instanceof ErroDaApi && falha.status === 401) {
      avisoPendente = aviso;
      irPara('#/entrar');
      return;
    }
    if (falha instanceof ErroDaApi && falha.status === 403) {
      raiz.replaceChildren(
        el('p', { class: 'erro' }, 'Esta tela é para alunos. Instrutor e administrador usam a API por enquanto.'),
        el('button', { type: 'button', onclick: () => void api.chamar('DELETE', '/sessoes/atual').then(() => irPara('#/entrar')) }, 'Sair'),
      );
      return;
    }
    raiz.replaceChildren(el('p', { class: 'erro' }, mensagemDe(falha)));
  }
}

window.addEventListener('hashchange', () => void mostrar());
void mostrar();
