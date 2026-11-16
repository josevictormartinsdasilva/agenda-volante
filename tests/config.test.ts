import { describe, expect, it } from 'vitest';
import { carregarConfig } from '../src/config.js';

describe('carregarConfig', () => {
  it('usa os valores padrão do negócio quando o ambiente está vazio', () => {
    const config = carregarConfig({});

    expect(config.port).toBe(3000);
    expect(config.cancelamentoAntecedenciaHoras).toBe(48);
    expect(config.duracaoAulaMinutos).toBe(50);
  });

  it('lê os valores do ambiente', () => {
    const config = carregarConfig({ PORT: '8080', CANCELAMENTO_ANTECEDENCIA_HORAS: '24' });

    expect(config.port).toBe(8080);
    expect(config.cancelamentoAntecedenciaHoras).toBe(24);
  });

  it('só usa banco quando DATABASE_URL está definida e não vazia', () => {
    expect(carregarConfig({}).databaseUrl).toBeUndefined();
    expect(carregarConfig({ DATABASE_URL: '' }).databaseUrl).toBeUndefined();
    expect(carregarConfig({ DATABASE_URL: 'postgresql://u:s@db:5432/x' }).databaseUrl).toBe(
      'postgresql://u:s@db:5432/x',
    );
  });

  it('em produção recusa subir sem DATABASE_URL, em vez de guardar os dados em memória', () => {
    expect(() => carregarConfig({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL é obrigatória/);
    expect(() => carregarConfig({ NODE_ENV: 'production', DATABASE_URL: '' })).toThrow(
      /DATABASE_URL é obrigatória/,
    );
  });

  it('em produção com DATABASE_URL, e fora de produção sem ela, sobe normalmente', () => {
    const url = 'postgresql://u:s@db:5432/x';

    expect(carregarConfig({ NODE_ENV: 'production', DATABASE_URL: url }).databaseUrl).toBe(url);
    expect(carregarConfig({ NODE_ENV: 'development' }).databaseUrl).toBeUndefined();
  });

  it('sessão dura 7 dias por padrão e a duração é configurável', () => {
    expect(carregarConfig({}).sessaoDuracaoHoras).toBe(168);
    expect(carregarConfig({ SESSAO_DURACAO_HORAS: '12' }).sessaoDuracaoHoras).toBe(12);
  });

  it('limites de login, porta de métricas e proxy têm padrões e são configuráveis', () => {
    expect(carregarConfig({})).toMatchObject({
      metricsPort: 9100,
      trustProxy: false,
      login: { maxTentativasPorEmail: 5, maxTentativasPorOrigem: 20, janelaMinutos: 15 },
    });
    expect(
      carregarConfig({
        METRICS_PORT: '9200',
        TRUST_PROXY: 'true',
        LOGIN_MAX_TENTATIVAS_POR_EMAIL: '3',
        LOGIN_MAX_TENTATIVAS_POR_ORIGEM: '50',
        LOGIN_JANELA_MINUTOS: '30',
      }),
    ).toMatchObject({
      metricsPort: 9200,
      trustProxy: true,
      login: { maxTentativasPorEmail: 3, maxTentativasPorOrigem: 50, janelaMinutos: 30 },
    });
  });

  it('TRUST_PROXY só aceita true ou false, e o limite de login não pode ser zero', () => {
    expect(carregarConfig({ TRUST_PROXY: 'false' }).trustProxy).toBe(false);
    expect(() => carregarConfig({ TRUST_PROXY: 'sim' })).toThrow(/TRUST_PROXY inválida/);
    expect(() => carregarConfig({ LOGIN_MAX_TENTATIVAS_POR_EMAIL: '0' })).toThrow(
      /LOGIN_MAX_TENTATIVAS_POR_EMAIL inválida/,
    );
    expect(() => carregarConfig({ LOGIN_JANELA_MINUTOS: '0' })).toThrow(/LOGIN_JANELA_MINUTOS inválida/);
  });

  it('o código de redefinição vale 60 minutos por padrão', () => {
    expect(carregarConfig({}).codigoRedefinicaoMinutos).toBe(60);
    expect(carregarConfig({ CODIGO_REDEFINICAO_MINUTOS: '30' }).codigoRedefinicaoMinutos).toBe(30);
    expect(() => carregarConfig({ CODIGO_REDEFINICAO_MINUTOS: '0' })).toThrow(/inválida/);
  });

  it('nenhuma credencial de conta vem do ambiente', () => {
    const config = carregarConfig({ INSTRUTOR_EMAIL: 'x@exemplo.com', INSTRUTOR_SENHA: 'qualquer-senha' });

    expect(JSON.stringify(config)).not.toContain('qualquer-senha');
  });

  it('falha cedo com valor inválido, em vez de subir com configuração errada', () => {
    expect(() => carregarConfig({ PORT: 'abc' })).toThrow(/PORT inválida/);
  });
});
