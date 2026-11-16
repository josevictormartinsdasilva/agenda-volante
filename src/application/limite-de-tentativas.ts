export interface RegrasDeTentativas {
  /** Quantas tentativas cabem numa janela. */
  maxTentativas: number;
  janelaMs: number;
}

interface Janela {
  inicio: number;
  tentativas: number;
}

/**
 * Conta tentativas por chave (e-mail ou IP) em janelas fixas: a primeira tentativa abre
 * uma janela de `janelaMs`; dentro dela cabem `maxTentativas`; as seguintes são recusadas
 * até a janela acabar. Tentativa recusada não conta, então insistir não estende o bloqueio.
 *
 * `tentar` checa e conta no mesmo passo, sem `await`: requisições simultâneas não passam
 * juntas antes de a primeira ser contada.
 *
 * Fica em memória, então vale por instância da API e zera ao reiniciar. Com mais de uma
 * instância, o contador precisa ir para um armazenamento compartilhado (ADR 0004).
 */
export class LimiteDeTentativas {
  private readonly janelas = new Map<string, Janela>();
  private ultimaLimpeza: number;

  constructor(
    private readonly regras: RegrasDeTentativas,
    private readonly agora: () => Date,
  ) {
    this.ultimaLimpeza = agora().getTime();
  }

  /**
   * Conta uma tentativa da chave. Devolve 0 se ela pode seguir, ou quantos segundos
   * faltam para poder tentar de novo (arredondado para cima, nunca 0 quando bloqueada).
   */
  tentar(chave: string): number {
    const agora = this.agora().getTime();
    this.descartarVencidas(agora);

    const janela = this.janelas.get(chave);
    if (!janela || agora >= janela.inicio + this.regras.janelaMs) {
      this.janelas.set(chave, { inicio: agora, tentativas: 1 });
      return 0;
    }
    if (janela.tentativas >= this.regras.maxTentativas) {
      return Math.ceil((janela.inicio + this.regras.janelaMs - agora) / 1000);
    }
    janela.tentativas++;
    return 0;
  }

  /** Tira uma tentativa da conta: a tentativa deu certo e não deve pesar no limite. */
  devolver(chave: string): void {
    const janela = this.janelas.get(chave);
    if (janela && janela.tentativas > 0) janela.tentativas--;
  }

  /** Zera a conta da chave. */
  esquecer(chave: string): void {
    this.janelas.delete(chave);
  }

  /** Quantas chaves estão sendo acompanhadas (para conferir que a memória não cresce). */
  get tamanho(): number {
    return this.janelas.size;
  }

  /** No máximo uma varredura por janela, para não percorrer o mapa a cada tentativa. */
  private descartarVencidas(agora: number): void {
    if (agora - this.ultimaLimpeza < this.regras.janelaMs) return;
    for (const [chave, janela] of this.janelas) {
      if (agora >= janela.inicio + this.regras.janelaMs) this.janelas.delete(chave);
    }
    this.ultimaLimpeza = agora;
  }
}

export interface LimitesDeLogin {
  porEmail: LimiteDeTentativas;
  porOrigem: LimiteDeTentativas;
}

/** Os dois limites do login, a partir da configuração. */
export function criarLimitesDeLogin(
  regras: { maxTentativasPorEmail: number; maxTentativasPorOrigem: number; janelaMinutos: number },
  agora: () => Date,
): LimitesDeLogin {
  const janelaMs = regras.janelaMinutos * 60_000;
  return {
    porEmail: new LimiteDeTentativas({ maxTentativas: regras.maxTentativasPorEmail, janelaMs }, agora),
    porOrigem: new LimiteDeTentativas({ maxTentativas: regras.maxTentativasPorOrigem, janelaMs }, agora),
  };
}
