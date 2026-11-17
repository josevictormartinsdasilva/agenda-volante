// Cliente da API usado pela interface. A sessão vai no cookie HttpOnly que o login grava:
// este código nunca vê o token (ADR 0006).

/** Erro devolvido pela API, com o status HTTP e a mensagem em português. */
export class ErroDaApi extends Error {
  /**
   * @param {number} status 0 quando nem chegou ao servidor
   * @param {string} mensagem
   */
  constructor(status, mensagem) {
    super(mensagem);
    this.name = 'ErroDaApi';
    this.status = status;
  }
}

/**
 * @param {typeof fetch} buscar o `fetch` do navegador; nos testes, um falso
 */
export function criarApi(buscar) {
  return {
    /**
     * @param {'GET' | 'POST' | 'DELETE'} metodo
     * @param {string} caminho
     * @param {object} [corpo]
     * @returns {Promise<any>} o JSON da resposta, ou undefined no 204
     */
    async chamar(metodo, caminho, corpo) {
      let resposta;
      try {
        resposta = await buscar(caminho, {
          method: metodo,
          credentials: 'same-origin',
          // Sem corpo, sem content-type: o Fastify recusa "application/json" vazio.
          headers: corpo === undefined ? {} : { 'content-type': 'application/json' },
          body: corpo === undefined ? undefined : JSON.stringify(corpo),
        });
      } catch {
        throw new ErroDaApi(0, 'Sem conexão com o servidor. Confira a internet e tente de novo.');
      }

      if (resposta.status === 204) return undefined;
      if (resposta.ok) return resposta.json();

      const mensagem = await resposta
        .json()
        .then((corpoDoErro) => corpoDoErro?.erro)
        .catch(() => undefined);
      throw new ErroDaApi(
        resposta.status,
        mensagem ?? `Algo deu errado (${resposta.status}). Tente de novo.`,
      );
    },
  };
}
