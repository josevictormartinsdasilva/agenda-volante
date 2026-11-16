import {
  AcessoNegado,
  AlunoNaoEncontrado,
  CodigoInvalido,
  ContaNaoEncontrada,
  CredenciaisInvalidas,
  MuitasTentativas,
  NaoAutenticado,
  SenhaIncorreta,
} from '../domain/erros.js';
import type { Armazenamento } from '../domain/repositorios.js';
import type { Identidade, Papel, Usuario } from '../domain/tipos.js';
import type { LimitesDeLogin } from './limite-de-tentativas.js';

const MS_POR_HORA = 3_600_000;
const MS_POR_MINUTO = 60_000;

/** Nome que fica no lugar do nome do aluno que excluiu a conta. */
export const NOME_DE_ALUNO_REMOVIDO = 'Aluno removido';

/**
 * Canal que entrega o código de redefinição ao dono da conta. Hoje não há nenhum
 * implementado: o instrutor gera o código e repassa (ADR 0005). É o gancho para a
 * recuperação por e-mail: um envio por um provedor de e-mail implementa esta interface.
 */
export interface EnvioDeCodigo {
  enviar(mensagem: { email: string; codigo: string; expiraEm: Date }): Promise<void>;
}

export interface DependenciasDeAutenticacao {
  repositorios: Armazenamento;
  /** Hash de senha injetado: a aplicação não conhece o algoritmo (hoje, scrypt). */
  senhas: {
    gerarHash(senha: string): Promise<string>;
    conferir(senha: string, hash: string): Promise<boolean>;
  };
  tokens: {
    gerar(): string;
    resumir(token: string): string;
    /** Código curto, para uma pessoa ler e digitar (redefinição de senha). */
    gerarCodigo(): string;
  };
  sessaoDuracaoHoras: number;
  /** Por quantos minutos um código de redefinição vale. */
  codigoDuracaoMinutos: number;
  /** Tentativas de login por e-mail e por origem (IP). */
  limites: LimitesDeLogin;
  /** Sem canal, a recuperação por e-mail fica desligada. */
  envioDeCodigo?: EnvioDeCodigo;
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

/** Conta criada, sem nada da senha. */
export interface Conta {
  id: string;
  email: string;
}

export interface CodigoGerado {
  /** Só existe aqui: o armazenamento guarda apenas o resumo. */
  codigo: string;
  expiraEm: Date;
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
  /**
   * `origem` é o IP de quem tenta (opcional: sem ele, só vale o limite por e-mail).
   * Lança `MuitasTentativas` se o e-mail ou a origem passou do limite (ADR 0004).
   */
  entrar(dados: { email: string; senha: string; origem?: string }): Promise<SessaoAberta>;
  sair(token: string): Promise<void>;
  /** Lança `NaoAutenticado` se o token é desconhecido ou a sessão expirou. */
  identificar(token: string): Promise<Identidade>;
  /** Apaga as sessões já vencidas. Devolve quantas foram. */
  limparSessoesExpiradas(): Promise<number>;
  /**
   * Troca a senha de quem está logado, conferindo a atual (os erros contam no limite do
   * login). Derruba as outras sessões da conta; a de `tokenAtual`, se informada, fica.
   */
  trocarSenha(dados: {
    usuarioId: string;
    senhaAtual: string;
    novaSenha: string;
    tokenAtual?: string;
  }): Promise<void>;
  /**
   * O instrutor gera um código de uso único para o aluno que esqueceu a senha e o
   * repassa por fora (WhatsApp). Um código novo substitui o anterior.
   */
  gerarCodigoDeRedefinicao(alunoId: string): Promise<CodigoGerado>;
  /**
   * Sem login: troca a senha com o e-mail e o código. O código é consumido e todas as
   * sessões da conta caem. E-mail sem conta, código errado, usado ou vencido: tudo
   * responde `CodigoInvalido`. As tentativas contam no limite (por e-mail e origem).
   */
  redefinirSenha(dados: {
    email: string;
    codigo: string;
    novaSenha: string;
    origem?: string;
  }): Promise<void>;
  /**
   * Gancho da recuperação por e-mail: gera o código e o entrega pelo `envioDeCodigo`.
   * Ainda sem rota HTTP. E-mail sem conta não envia nada e não dá erro.
   */
  solicitarRedefinicaoPorEmail(email: string): Promise<void>;
  /**
   * O aluno exclui a própria conta, confirmando a senha: a conta, as sessões e o código
   * somem, o nome vira `NOME_DE_ALUNO_REMOVIDO` e as aulas futuras são canceladas. O
   * histórico de aulas passadas fica, sem o nome (docs/lgpd.md).
   */
  excluirConta(dados: { usuarioId: string; senha: string }): Promise<void>;
}

/** O e-mail identifica a conta sem diferenciar maiúsculas nem espaços nas pontas. */
const normalizarEmail = (email: string) => email.trim().toLowerCase();

/** O código vale do jeito que for digitado: sem diferença de caixa, hífen ou espaço. */
const normalizarCodigo = (codigo: string) => codigo.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Contas e sessões. Sessão é um token opaco guardado (como resumo) no armazenamento,
 * e não um JWT: dá para encerrar no logout e não há segredo de assinatura (ADR 0003).
 */
export function criarAutenticacao(dep: DependenciasDeAutenticacao): Autenticacao {
  const { repositorios: repos, senhas, tokens, limites } = dep;

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

  /**
   * Conta uma tentativa antes de qualquer `await`: chamadas simultâneas não passam juntas.
   * A origem vem primeiro: quem já foi barrado pelo IP não gasta o limite alheio.
   * Devolve a função a chamar quando a tentativa der certo.
   */
  function contarTentativa(chave: string, origem: string | undefined): () => void {
    const esperaDaOrigem = origem === undefined ? 0 : limites.porOrigem.tentar(origem);
    if (esperaDaOrigem > 0) throw new MuitasTentativas(esperaDaOrigem);
    const esperaDaChave = limites.porEmail.tentar(chave);
    if (esperaDaChave > 0) throw new MuitasTentativas(esperaDaChave);
    // Deu certo: os erros anteriores são esquecidos, e o acerto não pesa no limite da
    // origem (vários alunos podem entrar pela mesma rede).
    return () => {
      limites.porEmail.esquecer(chave);
      if (origem !== undefined) limites.porOrigem.devolver(origem);
    };
  }

  /** Confere a senha de quem já está logado; erros contam no limite do login. */
  async function exigirSenha(usuario: Usuario, senha: string): Promise<void> {
    const acertou = contarTentativa(usuario.email, undefined);
    if (!(await senhas.conferir(senha, usuario.senhaHash))) throw new SenhaIncorreta();
    acertou();
  }

  async function exigirUsuario(usuarioId: string): Promise<Usuario> {
    const usuario = await repos.usuarios.buscarPorId(usuarioId);
    if (!usuario) throw new NaoAutenticado();
    return usuario;
  }

  /** Gera e guarda (como resumo) um código novo, que substitui o anterior. */
  async function emitirCodigo(usuario: Usuario): Promise<CodigoGerado> {
    const codigo = tokens.gerarCodigo();
    const expiraEm = new Date(dep.agora().getTime() + dep.codigoDuracaoMinutos * MS_POR_MINUTO);
    await repos.codigos.salvar({
      usuarioId: usuario.id,
      codigoHash: tokens.resumir(normalizarCodigo(codigo)),
      expiraEm,
    });
    return { codigo, expiraEm };
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

    async entrar({ email, senha, origem }) {
      const chave = normalizarEmail(email);
      const acertou = contarTentativa(chave, origem);

      const usuario = await repos.usuarios.buscarPorEmail(chave);
      if (!usuario) {
        // Confere contra um hash qualquer para a resposta demorar o mesmo que a de
        // "senha errada": o tempo não revela se o e-mail tem conta.
        hashDeDespiste ??= senhas.gerarHash('senha-que-ninguem-tem');
        await senhas.conferir(senha, await hashDeDespiste);
        throw new CredenciaisInvalidas();
      }
      if (!(await senhas.conferir(senha, usuario.senhaHash))) throw new CredenciaisInvalidas();
      acertou();

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

    limparSessoesExpiradas: () => repos.sessoes.removerExpiradas(dep.agora()),

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

    async trocarSenha({ usuarioId, senhaAtual, novaSenha, tokenAtual }) {
      const usuario = await exigirUsuario(usuarioId);
      await exigirSenha(usuario, senhaAtual);
      const senhaHash = await senhas.gerarHash(novaSenha);
      await repos.emTransacao(async (tx) => {
        await tx.usuarios.trocarSenha(usuario.id, senhaHash);
        // Se a senha vazou, quem a usou perde o acesso; este aparelho continua logado.
        await tx.sessoes.removerDoUsuario(
          usuario.id,
          tokenAtual === undefined ? undefined : tokens.resumir(tokenAtual),
        );
      });
    },

    async gerarCodigoDeRedefinicao(alunoId) {
      if (!(await repos.alunos.buscarPorId(alunoId))) throw new AlunoNaoEncontrado();
      const usuario = await repos.usuarios.buscarPorAluno(alunoId);
      if (!usuario) throw new ContaNaoEncontrada();
      return emitirCodigo(usuario);
    },

    async redefinirSenha({ email, codigo, novaSenha, origem }) {
      const chave = normalizarEmail(email);
      // Chave própria: errar o código não bloqueia o login, e vice-versa.
      const acertou = contarTentativa(`redefinicao:${chave}`, origem);

      const usuario = await repos.usuarios.buscarPorEmail(chave);
      if (!usuario) throw new CodigoInvalido();
      // O hash (lento) é calculado antes, para a transação ficar curta.
      const senhaHash = await senhas.gerarHash(novaSenha);
      await repos.emTransacao(async (tx) => {
        // Consumir é um DELETE condicionado ao código e à validade: de dois usos
        // simultâneos, só um apaga a linha (o mesmo desenho do ADR 0002).
        const valido = await tx.codigos.consumir(
          usuario.id,
          tokens.resumir(normalizarCodigo(codigo)),
          dep.agora(),
        );
        if (!valido) throw new CodigoInvalido();
        await tx.usuarios.trocarSenha(usuario.id, senhaHash);
        await tx.sessoes.removerDoUsuario(usuario.id);
      });
      acertou();
    },

    async solicitarRedefinicaoPorEmail(email) {
      // Antes de expor isto numa rota: confirmar o e-mail no cadastro e limitar os
      // pedidos, senão vira um jeito de mandar spam (ADR 0005).
      if (!dep.envioDeCodigo) {
        throw new Error('Recuperação de senha por e-mail não configurada');
      }
      const usuario = await repos.usuarios.buscarPorEmail(normalizarEmail(email));
      if (!usuario) return;
      const { codigo, expiraEm } = await emitirCodigo(usuario);
      await dep.envioDeCodigo.enviar({ email: usuario.email, codigo, expiraEm });
    },

    async excluirConta({ usuarioId, senha }) {
      const usuario = await exigirUsuario(usuarioId);
      // Instrutor e administrador são contas de trabalho: saem pelo administrador.
      if (usuario.papel !== 'aluno' || usuario.alunoId === null) throw new AcessoNegado();
      await exigirSenha(usuario, senha);
      const alunoId = usuario.alunoId;
      const agora = dep.agora().getTime();

      await repos.emTransacao(async (tx) => {
        for (const aula of await tx.aulas.listarDoAluno(alunoId)) {
          // Aula futura vira horário livre para outro aluno; a passada é histórico.
          if (aula.status === 'reservada' && aula.inicio.getTime() > agora) {
            await tx.aulas.cancelar(aula.id);
          }
        }
        await tx.alunos.salvar({ id: alunoId, nome: NOME_DE_ALUNO_REMOVIDO });
        await tx.sessoes.removerDoUsuario(usuario.id);
        await tx.codigos.remover(usuario.id);
        await tx.usuarios.remover(usuario.id);
      });
    },
  };
}
