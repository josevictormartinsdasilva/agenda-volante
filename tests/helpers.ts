import { buildApp } from '../src/app.js';
import { criarAutenticacao } from '../src/application/autenticacao.js';
import { criarCasosDeUso } from '../src/application/casos-de-uso.js';
import { criarLimitesDeLogin } from '../src/application/limite-de-tentativas.js';
import { CancelamentoComAntecedencia } from '../src/domain/politica-cancelamento.js';
import type { EnvioDeCodigo } from '../src/application/autenticacao.js';
import type { Aluno } from '../src/domain/tipos.js';
import { criarRepositoriosEmMemoria } from '../src/infra/memoria/repositorios-em-memoria.js';
import { gerarCodigoCurto, gerarToken, resumirToken } from '../src/seguranca/token.js';

/**
 * Hash de senha de mentira, instantâneo: os testes de fluxo não precisam pagar o custo do
 * scrypt em cada login. O hash de verdade é testado em `tests/seguranca/senha.test.ts`.
 */
export const senhasDeTeste = {
  gerarHash: async (senha: string) => `hash-de-teste:${senha}`,
  conferir: async (senha: string, hash: string) => hash === `hash-de-teste:${senha}`,
};

/**
 * Monta os casos de uso com repositórios em memória, relógio controlável e ids previsíveis.
 * `envioDeCodigo`: canal falso para testar a recuperação por e-mail (sem ele, não há canal).
 */
export function criarAmbiente(
  agoraInicial = new Date('2026-11-10T12:00:00.000Z'),
  envioDeCodigo?: EnvioDeCodigo,
) {
  const relogio = { agora: agoraInicial };
  let sequencia = 0;
  const repositorios = criarRepositoriosEmMemoria();
  const agora = () => relogio.agora;
  const gerarId = () => `id-${++sequencia}`;
  const casos = criarCasosDeUso({
    repositorios,
    duracaoAulaMinutos: 50,
    politica: new CancelamentoComAntecedencia(48),
    agora,
    gerarId,
  });
  const autenticacao = criarAutenticacao({
    repositorios,
    senhas: senhasDeTeste,
    tokens: { gerar: gerarToken, resumir: resumirToken, gerarCodigo: gerarCodigoCurto },
    sessaoDuracaoHoras: 24,
    codigoDuracaoMinutos: 60,
    envioDeCodigo,
    limites: criarLimitesDeLogin(
      { maxTentativasPorEmail: 5, maxTentativasPorOrigem: 20, janelaMinutos: 15 },
      agora,
    ),
    agora,
    gerarId,
  });
  return { casos, autenticacao, repositorios, relogio, gerarId };
}

export type Ambiente = ReturnType<typeof criarAmbiente>;

/** Grava um aluno direto no repositório, sem conta de acesso (para testar a agenda). */
export async function criarAluno(ambiente: Ambiente, nome: string): Promise<Aluno> {
  const aluno: Aluno = { id: ambiente.gerarId(), nome };
  await ambiente.repositorios.alunos.salvar(aluno);
  return aluno;
}

export const ADMIN = { email: 'admin@exemplo.com', senha: 'senha-do-admin' };
export const INSTRUTOR = { email: 'instrutor@exemplo.com', senha: 'senha-do-instrutor' };

async function cabecalho(ambiente: Ambiente, email: string, senha: string) {
  const { token } = await ambiente.autenticacao.entrar({ email, senha });
  return { authorization: `Bearer ${token}` };
}

/** Cabeçalho `authorization` de um instrutor logado (cria a conta se preciso). */
export async function cabecalhoDoInstrutor(ambiente: Ambiente) {
  if (!(await ambiente.repositorios.usuarios.buscarPorEmail(INSTRUTOR.email))) {
    await ambiente.autenticacao.cadastrarInstrutor(INSTRUTOR);
  }
  return cabecalho(ambiente, INSTRUTOR.email, INSTRUTOR.senha);
}

/** Cabeçalho `authorization` de um administrador logado (cria a conta se preciso). */
export async function cabecalhoDoAdmin(ambiente: Ambiente) {
  if (!(await ambiente.repositorios.usuarios.buscarPorEmail(ADMIN.email))) {
    await ambiente.autenticacao.criarAdmin(ADMIN);
  }
  return cabecalho(ambiente, ADMIN.email, ADMIN.senha);
}

/**
 * Aplicação HTTP de teste, com atalhos que devolvem o cabeçalho `authorization` de um
 * instrutor ou de um aluno recém-cadastrado.
 */
export function criarApp(ambiente: Ambiente = criarAmbiente()) {
  const app = buildApp({ logLevel: 'silent' }, ambiente.casos, ambiente.autenticacao);
  let alunos = 0;

  return {
    app,
    ambiente,
    comoAdmin: () => cabecalhoDoAdmin(ambiente),
    comoInstrutor: () => cabecalhoDoInstrutor(ambiente),
    async comoAluno(nome = 'Ana') {
      const email = `aluno${++alunos}@exemplo.com`;
      const senha = 'senha-do-aluno';
      const aluno = await ambiente.autenticacao.cadastrarAluno({ nome, email, senha });
      return { alunoId: aluno.id, email, senha, headers: await cabecalho(ambiente, email, senha) };
    },
  };
}
