import { createHash, randomBytes } from 'node:crypto';

/** Token de sessão: 32 bytes aleatórios (256 bits), impossível de adivinhar. */
export function gerarToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * O que vai para o banco é o SHA-256 do token, não o token. Como o token já é aleatório
 * e longo, um hash rápido basta (ao contrário da senha, que é curta e precisa do scrypt).
 */
export function resumirToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
