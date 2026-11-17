import { EmailJaCadastrado, HorarioOcupado, SaldoInsuficiente } from '../../domain/erros.js';
import type {
  AlunoRepository,
  Armazenamento,
  AulaRepository,
  CodigoDeRedefinicaoRepository,
  DisponibilidadeRepository,
  PacoteRepository,
  Repositorios,
  SessaoRepository,
  UsuarioRepository,
} from '../../domain/repositorios.js';
import type {
  Aluno,
  Aula,
  CodigoDeRedefinicao,
  Pacote,
  Papel,
  Sessao,
  Usuario,
} from '../../domain/tipos.js';

/**
 * Tabela em memória: um Map com "retrato", que copia o estado e devolve a função que o
 * restaura (o "rollback" da transação). Os valores são imutáveis, então copiar o Map basta.
 */
class Tabela<V> {
  linhas = new Map<string, V>();

  retrato(): () => void {
    const copia = new Map(this.linhas);
    return () => {
      this.linhas = copia;
    };
  }
}

/**
 * Implementações em memória das portas de persistência: os dados somem ao reiniciar.
 * Cumprem o mesmo contrato da versão Prisma (`tests/infra/contrato-de-repositorios.ts`).
 *
 * Os métodos checam e gravam sem `await` no meio, então cada um é atômico: o Node não
 * troca de requisição dentro de um trecho síncrono.
 */
class AlunoEmMemoria implements AlunoRepository {
  readonly tabela = new Tabela<Aluno>();

  async salvar(aluno: Aluno): Promise<void> {
    this.tabela.linhas.set(aluno.id, aluno);
  }

  async buscarPorId(id: string): Promise<Aluno | undefined> {
    return this.tabela.linhas.get(id);
  }

  async listar(): Promise<Aluno[]> {
    return [...this.tabela.linhas.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  }
}

class UsuarioEmMemoria implements UsuarioRepository {
  /** Chave: e-mail (único, como o índice do Postgres). */
  readonly tabela = new Tabela<Usuario>();

  async criar(usuario: Usuario): Promise<void> {
    if (this.tabela.linhas.has(usuario.email)) throw new EmailJaCadastrado();
    this.tabela.linhas.set(usuario.email, usuario);
  }

  async buscarPorEmail(email: string): Promise<Usuario | undefined> {
    return this.tabela.linhas.get(email);
  }

  async buscarPorId(id: string): Promise<Usuario | undefined> {
    return [...this.tabela.linhas.values()].find((u) => u.id === id);
  }

  async buscarPorAluno(alunoId: string): Promise<Usuario | undefined> {
    return [...this.tabela.linhas.values()].find((u) => u.alunoId === alunoId);
  }

  async listarPorPapel(papel: Papel): Promise<Usuario[]> {
    return [...this.tabela.linhas.values()].filter((u) => u.papel === papel);
  }

  async trocarSenha(id: string, senhaHash: string): Promise<void> {
    const usuario = await this.buscarPorId(id);
    if (usuario) this.tabela.linhas.set(usuario.email, { ...usuario, senhaHash });
  }

  async remover(id: string): Promise<void> {
    const usuario = await this.buscarPorId(id);
    if (usuario) this.tabela.linhas.delete(usuario.email);
  }
}

class CodigoEmMemoria implements CodigoDeRedefinicaoRepository {
  /** Chave: id da conta (um código por conta). */
  readonly tabela = new Tabela<CodigoDeRedefinicao>();

  async salvar(codigo: CodigoDeRedefinicao): Promise<void> {
    this.tabela.linhas.set(codigo.usuarioId, codigo);
  }

  async consumir(usuarioId: string, codigoHash: string, agora: Date): Promise<boolean> {
    const codigo = this.tabela.linhas.get(usuarioId);
    if (!codigo || codigo.codigoHash !== codigoHash) return false;
    if (codigo.expiraEm.getTime() <= agora.getTime()) return false;
    this.tabela.linhas.delete(usuarioId);
    return true;
  }

  async remover(usuarioId: string): Promise<void> {
    this.tabela.linhas.delete(usuarioId);
  }
}

class SessaoEmMemoria implements SessaoRepository {
  readonly tabela = new Tabela<Sessao>();

  async salvar(sessao: Sessao): Promise<void> {
    this.tabela.linhas.set(sessao.tokenHash, sessao);
  }

  async buscar(tokenHash: string): Promise<Sessao | undefined> {
    return this.tabela.linhas.get(tokenHash);
  }

  async remover(tokenHash: string): Promise<void> {
    this.tabela.linhas.delete(tokenHash);
  }

  async removerDoUsuario(usuarioId: string, excetoTokenHash?: string): Promise<number> {
    let removidas = 0;
    for (const [tokenHash, sessao] of this.tabela.linhas) {
      if (sessao.usuarioId === usuarioId && tokenHash !== excetoTokenHash) {
        this.tabela.linhas.delete(tokenHash);
        removidas++;
      }
    }
    return removidas;
  }

  async removerExpiradas(ate: Date): Promise<number> {
    let removidas = 0;
    for (const [tokenHash, sessao] of this.tabela.linhas) {
      if (sessao.expiraEm.getTime() <= ate.getTime()) {
        this.tabela.linhas.delete(tokenHash);
        removidas++;
      }
    }
    return removidas;
  }
}

class PacoteEmMemoria implements PacoteRepository {
  readonly tabela = new Tabela<Pacote>();

  async creditar(alunoId: string, quantidade: number): Promise<Pacote> {
    const pacote = { alunoId, saldo: (this.tabela.linhas.get(alunoId)?.saldo ?? 0) + quantidade };
    this.tabela.linhas.set(alunoId, pacote);
    return pacote;
  }

  async debitar(alunoId: string): Promise<Pacote> {
    const atual = this.tabela.linhas.get(alunoId);
    if (!atual || atual.saldo < 1) throw new SaldoInsuficiente();
    const pacote = { alunoId, saldo: atual.saldo - 1 };
    this.tabela.linhas.set(alunoId, pacote);
    return pacote;
  }

  async buscarPorAluno(alunoId: string): Promise<Pacote | undefined> {
    return this.tabela.linhas.get(alunoId);
  }

  async listar(): Promise<Pacote[]> {
    return [...this.tabela.linhas.values()];
  }
}

class DisponibilidadeEmMemoria implements DisponibilidadeRepository {
  /** Instantes em ms: o Set descarta duplicados. */
  private readonly inicios = new Set<number>();

  async publicar(inicios: readonly Date[]): Promise<void> {
    for (const inicio of inicios) this.inicios.add(inicio.getTime());
  }

  async listarEntre(de: Date, ate: Date): Promise<Date[]> {
    return [...this.inicios]
      .filter((ms) => ms >= de.getTime() && ms < ate.getTime())
      .map((ms) => new Date(ms));
  }
}

class AulaEmMemoria implements AulaRepository {
  readonly tabela = new Tabela<Aula>();

  async salvar(aula: Aula): Promise<void> {
    // R3 no armazenamento, como o índice único parcial do Postgres.
    const conflito = [...this.tabela.linhas.values()].some(
      (a) =>
        a.id !== aula.id &&
        a.status === 'reservada' &&
        aula.status === 'reservada' &&
        a.inicio.getTime() === aula.inicio.getTime(),
    );
    if (conflito) throw new HorarioOcupado();
    this.tabela.linhas.set(aula.id, aula);
  }

  async cancelar(id: string): Promise<boolean> {
    const aula = this.tabela.linhas.get(id);
    if (aula?.status !== 'reservada') return false;
    this.tabela.linhas.set(id, { ...aula, status: 'cancelada' });
    return true;
  }

  async buscarPorId(id: string): Promise<Aula | undefined> {
    return this.tabela.linhas.get(id);
  }

  async listarEntre(de: Date, ate: Date): Promise<Aula[]> {
    return [...this.tabela.linhas.values()].filter(
      (a) => a.inicio.getTime() >= de.getTime() && a.inicio.getTime() < ate.getTime(),
    );
  }

  async listarDoAluno(alunoId: string): Promise<Aula[]> {
    return [...this.tabela.linhas.values()]
      .filter((a) => a.alunoId === alunoId)
      .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  }
}

export function criarRepositoriosEmMemoria(): Armazenamento {
  const alunos = new AlunoEmMemoria();
  const usuarios = new UsuarioEmMemoria();
  const sessoes = new SessaoEmMemoria();
  const codigos = new CodigoEmMemoria();
  const pacotes = new PacoteEmMemoria();
  const aulas = new AulaEmMemoria();
  const repos: Repositorios = {
    alunos,
    usuarios,
    sessoes,
    codigos,
    pacotes,
    disponibilidade: new DisponibilidadeEmMemoria(),
    aulas,
  };
  // O que uma transação que falha desfaz. A disponibilidade fica de fora: nenhuma
  // transação a grava hoje.
  const tabelas = [alunos, usuarios, sessoes, codigos, pacotes, aulas].map((r) => r.tabela);

  // Uma transação por vez: cada uma espera a anterior terminar. Assim o retrato tirado no
  // início não apaga, ao ser restaurado, o que outra transação gravou no meio.
  // Limite: uma gravação feita fora de transação enquanto outra está aberta se perde se
  // ela falhar.
  let fila: Promise<unknown> = Promise.resolve();

  return {
    ...repos,
    emTransacao<T>(trabalho: (repos: Repositorios) => Promise<T>): Promise<T> {
      const execucao = fila.then(async () => {
        const desfazer = tabelas.map((tabela) => tabela.retrato());
        try {
          return await trabalho(repos);
        } catch (erro) {
          for (const restaurar of desfazer) restaurar();
          throw erro;
        }
      });
      fila = execucao.catch(() => undefined);
      return execucao;
    },
  };
}
