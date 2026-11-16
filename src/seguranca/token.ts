import { createHash, randomBytes, randomInt } from 'node:crypto';

/** 31 símbolos: letras maiúsculas e dígitos, sem os que se confundem (0, O, 1, I, L). */
const ALFABETO_DO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Token de sessão: 32 bytes aleatórios (256 bits), impossível de adivinhar. */
export function gerarToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Código de redefinição, para uma pessoa ler no WhatsApp e digitar: 8 símbolos em dois
 * grupos (ex.: `K7QM-3XRA`). São cerca de 40 bits: pouco para um token de sessão, mas
 * suficiente para um código que vale 1 hora, serve uma vez e só admite 5 tentativas a
 * cada 15 minutos por e-mail.
 */
export function gerarCodigoCurto(): string {
  const simbolos = Array.from({ length: 8 }, () => ALFABETO_DO_CODIGO[randomInt(ALFABETO_DO_CODIGO.length)]);
  return `${simbolos.slice(0, 4).join('')}-${simbolos.slice(4).join('')}`;
}

/**
 * O que vai para o banco é o SHA-256 do token, não o token. Como o token já é aleatório
 * e longo, um hash rápido basta (ao contrário da senha, que é curta e precisa do scrypt).
 */
export function resumirToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
