import { describe, expect, it } from 'vitest';
import { conferirSenha, gerarHashDaSenha } from '../../src/seguranca/senha.js';
import { gerarToken, resumirToken } from '../../src/seguranca/token.js';

describe('hash de senha (scrypt)', () => {
  it('confere a senha certa e recusa a errada', async () => {
    const hash = await gerarHashDaSenha('senha-da-ana');

    expect(await conferirSenha('senha-da-ana', hash)).toBe(true);
    expect(await conferirSenha('senha-da-anA', hash)).toBe(false);
  });

  it('o hash não contém a senha e muda a cada vez (sal aleatório)', async () => {
    const um = await gerarHashDaSenha('senha-da-ana');
    const outro = await gerarHashDaSenha('senha-da-ana');

    expect(um).not.toContain('senha-da-ana');
    expect(um).not.toBe(outro);
    expect(um).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
  });

  it('recusa, sem lançar, um hash em formato desconhecido', async () => {
    expect(await conferirSenha('qualquer', 'texto-que-nao-e-hash')).toBe(false);
    expect(await conferirSenha('qualquer', 'scrypt:00:00')).toBe(false);
  });
});

describe('token de sessão', () => {
  it('é aleatório, longo e seguro para cabeçalho', () => {
    const um = gerarToken();

    expect(um).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes em base64url
    expect(gerarToken()).not.toBe(um);
  });

  it('o resumo é determinístico e diferente do token', () => {
    const token = gerarToken();

    expect(resumirToken(token)).toBe(resumirToken(token));
    expect(resumirToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(resumirToken(token)).not.toBe(token);
  });
});
