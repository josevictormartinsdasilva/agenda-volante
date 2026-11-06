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

  it('falha cedo com valor inválido, em vez de subir com configuração errada', () => {
    expect(() => carregarConfig({ PORT: 'abc' })).toThrow(/PORT inválida/);
  });
});
