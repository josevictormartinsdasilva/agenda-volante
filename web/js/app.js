// Interface web: uma página só, com as telas trocadas pelo endereço (#/entrar, #/inicio,
// #/agenda...). Sem framework e sem etapa de build (ADR 0006).
//
// Este arquivo só decide qual tela mostrar: as telas ficam em publicas.js (sem login),
// aluno.js e instrutor.js; as peças comuns, em ui.js.

import { ErroDaApi } from './api.js';
import { telasDoAluno } from './aluno.js';
import { telasDoInstrutor } from './instrutor.js';
import { INICIO_POR_PAPEL, telaCriarConta, telaEntrar, telaEsqueci } from './publicas.js';
import { api, el, estado, irPara, mensagemDe } from './ui.js';

/** @typedef {import('./ui.js').Filho} Filho */
/** @typedef {{ papel: 'admin' | 'instrutor' | 'aluno', alunoId: string | null }} Sessao */

const raiz = /** @type {HTMLElement} */ (document.getElementById('app'));

/** @type {Record<string, () => Promise<Filho[]>>} */
const telasPublicas = {
  '#/entrar': telaEntrar,
  '#/criar-conta': telaCriarConta,
  '#/esqueci': telaEsqueci,
};

/** @type {Record<string, Record<string, () => Promise<Filho[]>>>} */
const telasPorPapel = { aluno: telasDoAluno, instrutor: telasDoInstrutor };

/** A tela do administrador ainda não existe: ele usa a API. */
async function telaAdmin() {
  return [
    el('h1', {}, 'Administrador'),
    el('p', {}, 'A interface do administrador ainda não existe. Cadastre instrutores pela API (POST /instrutores).'),
    el(
      'button',
      {
        type: 'button',
        class: 'secundario',
        onclick: () => void api.chamar('DELETE', '/sessoes/atual').then(() => irPara('#/entrar')),
      },
      'Sair',
    ),
  ];
}

/** As telas de quem está logado, conforme o papel. Sem sessão: lança 401. */
async function telasDaSessao() {
  /** @type {Sessao} */
  const sessao = await api.chamar('GET', '/sessoes/atual');
  const telas = telasPorPapel[sessao.papel] ?? { '#/admin': telaAdmin };
  return { telas, inicio: INICIO_POR_PAPEL[sessao.papel] };
}

async function mostrar() {
  const aviso = estado.aviso;
  estado.aviso = '';
  try {
    let tela = telasPublicas[location.hash];
    if (!tela) {
      const { telas, inicio } = await telasDaSessao();
      tela = telas[location.hash];
      if (!tela) {
        // Endereço vazio ou de outro papel: vai para o início de quem está logado.
        estado.aviso = aviso;
        irPara(inicio);
        return;
      }
    }
    const conteudo = await tela();
    raiz.replaceChildren(
      ...[aviso && el('p', { class: 'aviso', role: 'status' }, aviso), ...conteudo].filter(
        (filho) => filho !== null && filho !== undefined && filho !== false,
      ),
    );
    window.scrollTo(0, 0);
  } catch (falha) {
    if (falha instanceof ErroDaApi && falha.status === 401) {
      estado.aviso = aviso;
      irPara('#/entrar');
      return;
    }
    raiz.replaceChildren(el('p', { class: 'erro' }, mensagemDe(falha)));
  }
}

window.addEventListener('hashchange', () => void mostrar());
window.addEventListener('agenda:recarregar', () => void mostrar());
void mostrar();
