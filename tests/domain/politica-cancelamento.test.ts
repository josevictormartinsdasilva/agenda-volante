import { describe, expect, it } from 'vitest';
import { CancelamentoComAntecedencia } from '../../src/domain/politica-cancelamento.js';

describe('R6: política de cancelamento com antecedência mínima', () => {
  const inicioDaAula = new Date('2026-11-12T10:00:00.000Z');
  const politica = new CancelamentoComAntecedencia(48);

  it('devolve o crédito com mais de 48 h de antecedência', () => {
    const agora = new Date('2026-11-10T09:00:00.000Z'); // 49 h antes
    expect(politica.devolveCredito(inicioDaAula, agora)).toBe(true);
  });

  it('devolve o crédito com exatamente 48 h (o limite conta como "48 h ou mais")', () => {
    const agora = new Date('2026-11-10T10:00:00.000Z');
    expect(politica.devolveCredito(inicioDaAula, agora)).toBe(true);
  });

  it('não devolve com 1 minuto a menos de 48 h', () => {
    const agora = new Date('2026-11-10T10:01:00.000Z');
    expect(politica.devolveCredito(inicioDaAula, agora)).toBe(false);
  });

  it('não devolve depois que a aula já começou', () => {
    const agora = new Date('2026-11-12T10:30:00.000Z');
    expect(politica.devolveCredito(inicioDaAula, agora)).toBe(false);
  });

  it('respeita a antecedência configurada (24 h)', () => {
    const de24h = new CancelamentoComAntecedencia(24);
    const agora = new Date('2026-11-11T09:00:00.000Z'); // 25 h antes
    expect(de24h.devolveCredito(inicioDaAula, agora)).toBe(true);
    expect(politica.devolveCredito(inicioDaAula, agora)).toBe(false);
  });
});
