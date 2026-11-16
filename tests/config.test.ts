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

  it('nenhuma credencial de conta vem do ambiente', () => {
    const config = carregarConfig({ INSTRUTOR_EMAIL: 'x@exemplo.com', INSTRUTOR_SENHA: 'qualquer-senha' });

    expect(JSON.stringify(config)).not.toContain('qualquer-senha');
  });

  it('falha cedo com valor inválido, em vez de subir com configuração errada', () => {
    expect(() => carregarConfig({ PORT: 'abc' })).toThrow(/PORT inválida/);
  });
});
