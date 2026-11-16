import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { buildApp } from './app.js';
import { criarAutenticacao } from './application/autenticacao.js';
import { criarCasosDeUso } from './application/casos-de-uso.js';
import { carregarConfig } from './config.js';
import { encerrarAoReceberSinal } from './encerramento.js';
import { CancelamentoComAntecedencia } from './domain/politica-cancelamento.js';
import { criarRepositoriosEmMemoria } from './infra/memoria/repositorios-em-memoria.js';
import { criarRepositoriosPrisma } from './infra/prisma/repositorios-prisma.js';
import { conferirSenha, gerarHashDaSenha } from './seguranca/senha.js';
import { gerarToken, resumirToken } from './seguranca/token.js';

const config = carregarConfig();

// Composição: único lugar que escolhe as implementações concretas.
// Com DATABASE_URL a API usa o Postgres; sem ela, guarda tudo em memória (some ao reiniciar).
// Em produção, `carregarConfig` já recusou a subida sem DATABASE_URL.
const prisma = config.databaseUrl
  ? new PrismaClient({ datasourceUrl: config.databaseUrl })
  : undefined;
const repositorios = prisma ? criarRepositoriosPrisma(prisma) : criarRepositoriosEmMemoria();

const casos = criarCasosDeUso({
  repositorios,
  duracaoAulaMinutos: config.duracaoAulaMinutos,
  politica: new CancelamentoComAntecedencia(config.cancelamentoAntecedenciaHoras),
  agora: () => new Date(),
  gerarId: randomUUID,
});

const autenticacao = criarAutenticacao({
  repositorios,
  senhas: { gerarHash: gerarHashDaSenha, conferir: conferirSenha },
  tokens: { gerar: gerarToken, resumir: resumirToken },
  sessaoDuracaoHoras: config.sessaoDuracaoHoras,
  agora: () => new Date(),
  gerarId: randomUUID,
});

// O `/ready` só responde 200 se o banco responder a uma consulta mínima.
const app = buildApp(config, casos, autenticacao, async () => {
  if (prisma) await prisma.$queryRaw`SELECT 1`;
});
app.log.info({ armazenamento: prisma ? 'postgres' : 'memoria' }, 'repositórios configurados');
app.addHook('onClose', async () => {
  await prisma?.$disconnect();
});

encerrarAoReceberSinal(app);

try {
  await app.listen({ port: config.port, host: config.host });
} catch (erro) {
  app.log.error(erro);
  process.exit(1);
}
