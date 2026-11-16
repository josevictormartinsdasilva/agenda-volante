import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { criarAutenticacao } from './application/autenticacao.js';
import { criarLimitesDeLogin } from './application/limite-de-tentativas.js';
import { criarAdminPeloTerminal } from './cli/criar-admin.js';
import { criarTerminal } from './cli/terminal.js';
import { carregarConfig } from './config.js';
import { criarRepositoriosPrisma } from './infra/prisma/repositorios-prisma.js';
import { conferirSenha, gerarHashDaSenha } from './seguranca/senha.js';
import { gerarCodigoCurto, gerarToken, resumirToken } from './seguranca/token.js';

/**
 * Comando para criar uma conta de administrador (a primeira, ou outra):
 *   docker compose exec api npm run admin:criar
 * Pergunta e-mail e senha no terminal; nada fica em .env nem no Compose.
 */
const config = carregarConfig();
if (!config.databaseUrl) {
  // Em memória a conta sumiria com este processo: ela precisa ir para o banco da API.
  process.stderr.write('DATABASE_URL não definida: o administrador precisa ser gravado no banco.\n');
  process.exit(1);
}

const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });
const autenticacao = criarAutenticacao({
  repositorios: criarRepositoriosPrisma(prisma),
  senhas: { gerarHash: gerarHashDaSenha, conferir: conferirSenha },
  tokens: { gerar: gerarToken, resumir: resumirToken, gerarCodigo: gerarCodigoCurto },
  sessaoDuracaoHoras: config.sessaoDuracaoHoras,
  codigoDuracaoMinutos: config.codigoRedefinicaoMinutos,
  limites: criarLimitesDeLogin(config.login, () => new Date()), // não há login aqui
  agora: () => new Date(),
  gerarId: randomUUID,
});
const terminal = criarTerminal({
  entrada: process.stdin,
  saida: process.stdout,
  interativo: Boolean(process.stdin.isTTY),
});

try {
  process.exitCode = await criarAdminPeloTerminal(autenticacao, terminal);
} finally {
  terminal.fechar();
  await prisma.$disconnect();
}
