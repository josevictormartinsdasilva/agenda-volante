import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { buildApp } from './app.js';
import { criarCasosDeUso } from './application/casos-de-uso.js';
import { carregarConfig } from './config.js';
import { CancelamentoComAntecedencia } from './domain/politica-cancelamento.js';
import { criarRepositoriosEmMemoria } from './infra/memoria/repositorios-em-memoria.js';
import { criarRepositoriosPrisma } from './infra/prisma/repositorios-prisma.js';

const config = carregarConfig();

// Composição: único lugar que escolhe as implementações concretas.
// Com DATABASE_URL a API usa o Postgres; sem ela, guarda tudo em memória (some ao reiniciar).
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

const app = buildApp(config, casos);
app.log.info({ armazenamento: prisma ? 'postgres' : 'memoria' }, 'repositórios configurados');
app.addHook('onClose', async () => {
  await prisma?.$disconnect();
});

try {
  await app.listen({ port: config.port, host: config.host });
} catch (erro) {
  app.log.error(erro);
  process.exit(1);
}
