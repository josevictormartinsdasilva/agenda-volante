import { describe, expect, it } from 'vitest';
import { LimiteDeTentativas } from '../../src/application/limite-de-tentativas.js';

const MINUTO = 60_000;

function criar(maxTentativas = 3, janelaMinutos = 15) {
  const relogio = { agora: new Date('2026-11-16T12:00:00.000Z') };
  const limite = new LimiteDeTentativas(
    { maxTentativas, janelaMs: janelaMinutos * MINUTO },
    () => relogio.agora,
  );
  const avancar = (ms: number) => {
    relogio.agora = new Date(relogio.agora.getTime() + ms);
  };
  return { limite, avancar };
}

describe('LimiteDeTentativas', () => {
  it('deixa passar até o máximo de tentativas e bloqueia a seguinte', () => {
    const { limite } = criar(3);

    expect([limite.tentar('ana'), limite.tentar('ana'), limite.tentar('ana')]).toEqual([0, 0, 0]);
    expect(limite.tentar('ana')).toBe(15 * 60); // segundos até a janela acabar
  });

  it('a espera diminui com o tempo e a chave volta a passar quando a janela acaba', () => {
    const { limite, avancar } = criar(1);
    limite.tentar('ana');

    avancar(10 * MINUTO);
    expect(limite.tentar('ana')).toBe(5 * 60);

    avancar(5 * MINUTO);
    expect(limite.tentar('ana')).toBe(0);
  });

  it('tentativa bloqueada não estende o bloqueio', () => {
    const { limite, avancar } = criar(1);
    limite.tentar('ana');
    for (let i = 0; i < 50; i++) limite.tentar('ana');

    avancar(15 * MINUTO);

    expect(limite.tentar('ana')).toBe(0);
  });

  it('arredonda a espera para cima, para nunca dizer "tente em 0 s" a quem está bloqueado', () => {
    const { limite, avancar } = criar(1);
    limite.tentar('ana');

    avancar(15 * MINUTO - 1);

    expect(limite.tentar('ana')).toBe(1);
  });

  it('cada chave tem a sua conta', () => {
    const { limite } = criar(1);
    limite.tentar('ana');

    expect(limite.tentar('ana')).toBeGreaterThan(0);
    expect(limite.tentar('bia')).toBe(0);
  });

  it('esquecer zera a conta da chave', () => {
    const { limite } = criar(2);
    limite.tentar('ana');
    limite.tentar('ana');

    limite.esquecer('ana');

    expect(limite.tentar('ana')).toBe(0);
  });

  it('devolver tira uma tentativa da conta, sem ficar negativa', () => {
    const { limite } = criar(2);
    limite.tentar('ana');
    limite.tentar('ana');

    limite.devolver('ana');
    limite.devolver('ana');
    limite.devolver('ana');
    limite.devolver('nunca-tentou');

    expect([limite.tentar('ana'), limite.tentar('ana')]).toEqual([0, 0]);
    expect(limite.tentar('ana')).toBeGreaterThan(0);
  });

  it('descarta as janelas vencidas para a memória não crescer sem limite', () => {
    const { limite, avancar } = criar(5);
    for (let i = 0; i < 100; i++) limite.tentar(`chave-${i}`);
    expect(limite.tamanho).toBe(100);

    avancar(16 * MINUTO);
    limite.tentar('nova');

    expect(limite.tamanho).toBe(1);
  });
});
