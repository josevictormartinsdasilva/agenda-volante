import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  senha: string,
  sal: Buffer,
  tamanho: number,
) => Promise<Buffer>;

const BYTES_DO_SAL = 16;
const BYTES_DO_HASH = 64;

/**
 * Hash de senha com scrypt, que já vem no Node (sem dependência nativa na imagem).
 * O scrypt é lento e gasta memória de propósito: quem roubar o banco não testa bilhões
 * de senhas por segundo. O sal aleatório faz senhas iguais terem hashes diferentes.
 * Formato guardado: `scrypt:<sal em hex>:<hash em hex>`.
 */
export async function gerarHashDaSenha(senha: string): Promise<string> {
  const sal = randomBytes(BYTES_DO_SAL);
  const hash = await scryptAsync(senha, sal, BYTES_DO_HASH);
  return `scrypt:${sal.toString('hex')}:${hash.toString('hex')}`;
}

export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  const [algoritmo, salHex, hashHex] = guardado.split(':');
  if (algoritmo !== 'scrypt' || !salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  if (esperado.length !== BYTES_DO_HASH) return false;
  const calculado = await scryptAsync(senha, Buffer.from(salHex, 'hex'), BYTES_DO_HASH);
  // Comparação em tempo constante: o tempo de resposta não revela quantos bytes bateram.
  return timingSafeEqual(calculado, esperado);
}
