import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

export interface Terminal {
  /** Mostra a pergunta e devolve a linha digitada. `oculto`: o que se digita não aparece. */
  perguntar(texto: string, opcoes?: { oculto?: boolean }): Promise<string>;
  escrever(texto: string): void;
  fechar(): void;
}

/**
 * Terminal de perguntas e respostas sobre streams (no processo real, stdin e stdout).
 *
 * - Lê pelo iterador de linhas do readline, que guarda as linhas que chegam antes da
 *   pergunta: funciona digitando e também com a entrada vinda de um pipe.
 * - Para ocultar a senha, o eco do que se digita passa por uma saída que pode ser
 *   silenciada; a pergunta em si vai direto para a saída real.
 */
export function criarTerminal(opcoes: {
  entrada: NodeJS.ReadableStream;
  saida: NodeJS.WritableStream;
  /** Verdadeiro quando há uma pessoa digitando (stdin é um TTY): o readline ecoa o texto. */
  interativo: boolean;
}): Terminal {
  const { entrada, saida, interativo } = opcoes;
  let silenciar = false;
  const eco = new Writable({
    write(pedaco, _codificacao, pronto) {
      if (!silenciar) saida.write(pedaco);
      pronto();
    },
  });
  const leitor = createInterface({ input: entrada, output: eco, terminal: interativo });
  const linhas = leitor[Symbol.asyncIterator]();

  return {
    async perguntar(texto, { oculto = false } = {}) {
      saida.write(texto);
      silenciar = oculto;
      const { value, done } = await linhas.next();
      silenciar = false;
      if (oculto) saida.write('\n');
      if (done) throw new Error('A entrada terminou antes da resposta');
      return value;
    },
    escrever: (texto) => {
      saida.write(texto);
    },
    fechar: () => leitor.close(),
  };
}
