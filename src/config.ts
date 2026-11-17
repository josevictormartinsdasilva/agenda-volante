/**
 * Configuração lida do ambiente (12-factor).
 * Nenhum segredo fica no código: valores sensíveis vêm do .env (fora do git).
 */
export interface Config {
  port: number;
  host: string;
  logLevel: string;
  /**
   * Conexão com o Postgres. Sem ela a API guarda os dados em memória (útil em dev e testes).
   * Em produção (`NODE_ENV=production`) é obrigatória: a memória perderia tudo ao reiniciar.
   */
  databaseUrl: string | undefined;
  /** Antecedência mínima, em horas, para cancelar e recuperar o crédito da aula. */
  cancelamentoAntecedenciaHoras: number;
  /** Duração máxima da aula, em minutos. Aulas começam sempre em hora cheia. */
  duracaoAulaMinutos: number;
  /**
   * Por quantas horas um login vale antes de pedir a senha de novo. Nenhuma credencial de
   * conta vem do ambiente: o administrador nasce do comando `criar-admin` (ADR 0003).
   */
  sessaoDuracaoHoras: number;
  /** Por quantos minutos vale o código de redefinição de senha que o instrutor gera. */
  codigoRedefinicaoMinutos: number;
  /**
   * Cookie da sessão só por HTTPS (`Secure`). Desligue apenas para usar a interface em
   * http local (o Compose desliga); em produção fica ligado.
   */
  cookieSeguro: boolean;
  /** Porta interna do `/metrics`, separada da API e não publicada no Compose. */
  metricsPort: number;
  /**
   * Confiar no X-Forwarded-For para saber o IP do cliente. Ligue só atrás de um proxy
   * (nginx, balanceador) que reescreve o cabeçalho; sem proxy, o cliente forjaria o IP.
   */
  trustProxy: boolean;
  /** Limite de tentativas de login, por e-mail e por IP, numa janela de tempo. */
  login: { maxTentativasPorEmail: number; maxTentativasPorOrigem: number; janelaMinutos: number };
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

/** Inteiro de 1 em diante: zero desligaria o limite ou daria janela vazia. */
function positivo(nome: string, padrao: number, env: NodeJS.ProcessEnv): number {
  const valor = inteiro(nome, padrao, env);
  if (valor < 1) throw new Error(`Variável de ambiente ${nome} inválida: "${env[nome]}"`);
  return valor;
}

function booleano(nome: string, padrao: boolean, env: NodeJS.ProcessEnv): boolean {
  const bruto = env[nome];
  if (bruto === undefined || bruto === '') return padrao;
  if (bruto !== 'true' && bruto !== 'false') {
    throw new Error(`Variável de ambiente ${nome} inválida: "${bruto}" (use true ou false)`);
  }
  return bruto === 'true';
}

export function carregarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL || undefined;
  if (env.NODE_ENV === 'production' && !databaseUrl) {
    throw new Error(
      'DATABASE_URL é obrigatória em produção (NODE_ENV=production): sem ela os dados ficariam só em memória',
    );
  }
  return {
    port: inteiro('PORT', 3000, env),
    host: env.HOST ?? '0.0.0.0',
    logLevel: env.LOG_LEVEL ?? 'info',
    databaseUrl,
    cancelamentoAntecedenciaHoras: inteiro('CANCELAMENTO_ANTECEDENCIA_HORAS', 48, env),
    duracaoAulaMinutos: inteiro('DURACAO_AULA_MINUTOS', 50, env),
    sessaoDuracaoHoras: inteiro('SESSAO_DURACAO_HORAS', 168, env),
    codigoRedefinicaoMinutos: positivo('CODIGO_REDEFINICAO_MINUTOS', 60, env),
    cookieSeguro: booleano('COOKIE_SEGURO', true, env),
    metricsPort: inteiro('METRICS_PORT', 9100, env),
    trustProxy: booleano('TRUST_PROXY', false, env),
    login: {
      maxTentativasPorEmail: positivo('LOGIN_MAX_TENTATIVAS_POR_EMAIL', 5, env),
      maxTentativasPorOrigem: positivo('LOGIN_MAX_TENTATIVAS_POR_ORIGEM', 20, env),
      janelaMinutos: positivo('LOGIN_JANELA_MINUTOS', 15, env),
    },
  };
}
