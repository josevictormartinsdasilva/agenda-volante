import { CredenciaisInvalidas, NaoAutenticado } from '../domain/erros.js';
import type { Armazenamento } from '../domain/repositorios.js';
import type { Identidade, Papel } from '../domain/tipos.js';

const MS_POR_HORA = 3_600_000;

export interface DependenciasDeAutenticacao {
  repositorios: Armazenamento;
  /** Hash de senha injetado: a aplicação não conhece o algoritmo (hoje, scrypt). */
  senhas: {
    gerarHash(senha: string): Promise<string>;
    conferir(senha: string, hash: string): Promise<boolean>;
  };
  tokens: { gerar(): string; resumir(token: string): string };
  sessaoDuracaoHoras: number;
  agora: () => Date;
  gerarId: () => string;
}

export interface SessaoAberta {
  /** Só existe aqui, na resposta do login: o armazenamento guarda apenas o resumo. */
  token: string;
  expiraEm: Date;
  papel: Papel;
  alunoId: string | null;
}

export interface Autenticacao {
  cadastrarAluno(dados: {
    nome: string;
    email: string;
    senha: string;
  }): Promise<{ id: string; nome: string; email: string }>;
  /**
   * Conta de administrador. Só o comando `criar-admin` chama isto: não há rota HTTP que
   * crie administrador, então a primeira conta não depende de credencial em configuração.
   */
  criarAdmin(dados: { email: string; senha: string }): Promise<Conta>;
  /** Conta de instrutor, criada pelo administrador. */
  cadastrarInstrutor(dados: { email: string; senha: string }): Promise<Conta>;
  entrar(dados: { email: string; senha: string }): Promise<SessaoAberta>;
  sair(token: string): Promise<void>;
  /** Lança `NaoAutenticado` se o token é desconhecido ou a sessão expirou. */
  identificar(token: string): Promise<Identidade>;
}

/** Conta criada, sem nada da senha. */
export interface Conta {
  id: string;
  email: string;
}

/** O e-mail identifica a conta sem diferenciar maiúsculas nem espaços nas pontas. */
const normalizarEmail = (email: string) => email.trim().toLowerCase();

/**
 * Contas e sessões. Sessão é um token opaco guardado (como resumo) no armazenamento,
 * e não um JWT: dá para encerrar no logout e não há segredo de assinatura (ADR 0003).
 */
export function criarAutenticacao(dep: DependenciasDeAutenticacao): Autenticacao {
  const { repositorios: repos, senhas, tokens } = dep;

  // Hash de uma senha qualquer, calculado uma vez: serve para gastar o mesmo tempo
  // quando o e-mail não existe (ver `entrar`).
  let hashDeDespiste: Promise<string> | undefined;

  /** Conta sem aluno (admin ou instrutor). E-mail repetido: `EmailJaCadastrado`. */
  async function criarConta(papel: 'admin' | 'instrutor', email: string, senha: string) {
    const conta = { id: dep.gerarId(), email: normalizarEmail(email) };
    await repos.usuarios.criar({
      ...conta,
      senhaHash: await senhas.gerarHash(senha),
      papel,
      alunoId: null,
    });
    return conta;
  }

  return {
    async cadastrarAluno({ nome, email, senha }) {
      const aluno = { id: dep.gerarId(), nome };
      const usuario = {
        id: dep.gerarId(),
        email: normalizarEmail(email),
        senhaHash: await senhas.gerarHash(senha),
        papel: 'aluno' as const,
        alunoId: aluno.id,
      };
      // Aluno e conta nascem juntos: se o e-mail já existe, o aluno também não fica gravado.
      await repos.emTransacao(async (tx) => {
        await tx.alunos.salvar(aluno);
        await tx.usuarios.criar(usuario);
      });
      return { id: aluno.id, nome, email: usuario.email };
    },

    criarAdmin: ({ email, senha }) => criarConta('admin', email, senha),

    cadastrarInstrutor: ({ email, senha }) => criarConta('instrutor', email, senha),

    async entrar({ email, senha }) {
      const usuario = await repos.usuarios.buscarPorEmail(normalizarEmail(email));
      if (!usuario) {
        // Confere contra um hash qualquer para a resposta demorar o mesmo que a de
        // "senha errada": o tempo não revela se o e-mail tem conta.
        hashDeDespiste ??= senhas.gerarHash('senha-que-ninguem-tem');
        await senhas.conferir(senha, await hashDeDespiste);
        throw new CredenciaisInvalidas();
      }
      if (!(await senhas.conferir(senha, usuario.senhaHash))) throw new CredenciaisInvalidas();

      const token = tokens.gerar();
      const expiraEm = new Date(dep.agora().getTime() + dep.sessaoDuracaoHoras * MS_POR_HORA);
      await repos.sessoes.salvar({
        tokenHash: tokens.resumir(token),
        usuarioId: usuario.id,
        papel: usuario.papel,
        alunoId: usuario.alunoId,
        expiraEm,
      });
      return { token, expiraEm, papel: usuario.papel, alunoId: usuario.alunoId };
    },

    async sair(token) {
      await repos.sessoes.remover(tokens.resumir(token));
    },

    async identificar(token) {
      const tokenHash = tokens.resumir(token);
      const sessao = await repos.sessoes.buscar(tokenHash);
      if (!sessao) throw new NaoAutenticado();
      if (sessao.expiraEm.getTime() <= dep.agora().getTime()) {
        await repos.sessoes.remover(tokenHash);
        throw new NaoAutenticado();
      }
      return { usuarioId: sessao.usuarioId, papel: sessao.papel, alunoId: sessao.alunoId };
    },
  };
}
