/**
 * Configuração lida do ambiente (12-factor).
 * Nenhum segredo fica no código: valores sensíveis vêm do .env (fora do git).
 */
export interface Config {
  port: number;
  host: string;
  logLevel: string;
  /** Conexão com o Postgres. Sem ela a API guarda os dados em memória (útil em dev e testes). */
  databaseUrl: string | undefined;
  /** Antecedência mínima, em horas, para cancelar e recuperar o crédito da aula. */
  cancelamentoAntecedenciaHoras: number;
  /** Duração máxima da aula, em minutos. Aulas começam sempre em hora cheia. */
  duracaoAulaMinutos: number;
}

function inteiro(nome: string, padrao: number, env: NodeJS.ProcessEnv): number {
  const bruto = env[nome];
  if (bruto === undefined || bruto === '') return padrao;
  const valor = Number(bruto);
  if (!Number.isInteger(valor) || valor < 0) {
    throw new Error(`Variável de ambiente ${nome} inválida: "${bruto}"`);
  }
  return valor;
}

export function carregarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: inteiro('PORT', 3000, env),
    host: env.HOST ?? '0.0.0.0',
    logLevel: env.LOG_LEVEL ?? 'info',
    databaseUrl: env.DATABASE_URL || undefined,
    cancelamentoAntecedenciaHoras: inteiro('CANCELAMENTO_ANTECEDENCIA_HORAS', 48, env),
    duracaoAulaMinutos: inteiro('DURACAO_AULA_MINUTOS', 50, env),
  };
}
