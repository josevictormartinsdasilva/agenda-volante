import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Registry } from 'prom-client';
import { buildApp, buildAppDeMetricas } from './app.js';
import { criarAutenticacao } from './application/autenticacao.js';
import { criarCasosDeUso } from './application/casos-de-uso.js';
import { criarLimitesDeLogin } from './application/limite-de-tentativas.js';
import { carregarConfig } from './config.js';
import { encerrarAoReceberSinal } from './encerramento.js';
import { CancelamentoComAntecedencia } from './domain/politica-cancelamento.js';
import { criarRepositoriosEmMemoria } from './infra/memoria/repositorios-em-memoria.js';
import { criarRepositoriosPrisma } from './infra/prisma/repositorios-prisma.js';
import { conferirSenha, gerarHashDaSenha } from './seguranca/senha.js';
import { gerarToken, resumirToken } from './seguranca/token.js';
import { repetirPeriodicamente } from './tarefas.js';

const UMA_HORA_MS = 3_600_000;

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
  limites: criarLimitesDeLogin(config.login, () => new Date()),
  agora: () => new Date(),
  gerarId: randomUUID,
});

// O `/ready` só responde 200 se o banco responder a uma consulta mínima.
const registroDeMetricas = new Registry();
const app = buildApp(config, casos, autenticacao, {
  registroDeMetricas,
  verificarArmazenamento: async () => {
    if (prisma) await prisma.$queryRaw`SELECT 1`;
  },
});
const appDeMetricas = buildAppDeMetricas(registroDeMetricas, config);
app.log.info({ armazenamento: prisma ? 'postgres' : 'memoria' }, 'repositórios configurados');

// Sessão vencida já é recusada no uso; esta limpeza só evita que a tabela cresça.
const pararLimpeza = repetirPeriodicamente(
  async () => {
    const removidas = await autenticacao.limparSessoesExpiradas();
    if (removidas > 0) app.log.info({ removidas }, 'sessões expiradas removidas');
  },
  UMA_HORA_MS,
  (erro) => app.log.error({ err: erro }, 'falha ao remover sessões expiradas'),
);

app.addHook('onClose', async () => {
  pararLimpeza();
  await appDeMetricas.close();
  await prisma?.$disconnect();
});

encerrarAoReceberSinal(app);

try {
  await app.listen({ port: config.port, host: config.host });
  await appDeMetricas.listen({ port: config.metricsPort, host: config.host });
} catch (erro) {
  app.log.error(erro);
  process.exit(1);
}
