const MS_POR_HORA = 3_600_000;

/**
 * Strategy: decide se o cancelamento devolve o crédito da aula.
 * O caso de uso depende desta interface, não de uma regra fixa, então trocar a
 * política (ex.: sem multa em dia de chuva) não exige mexer em `cancelarAula`.
 */
export interface PoliticaDeCancelamento {
  devolveCredito(inicioDaAula: Date, agora: Date): boolean;
}

/** R6: devolve o crédito se faltar `horas` ou mais para a aula. */
export class CancelamentoComAntecedencia implements PoliticaDeCancelamento {
  constructor(private readonly horas: number) {}

  devolveCredito(inicioDaAula: Date, agora: Date): boolean {
    const faltaMs = inicioDaAula.getTime() - agora.getTime();
    return faltaMs >= this.horas * MS_POR_HORA;
  }
}
