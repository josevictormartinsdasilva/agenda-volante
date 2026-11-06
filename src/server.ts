import { buildApp } from './app.js';
import { carregarConfig } from './config.js';

const config = carregarConfig();
const app = buildApp(config);

try {
  await app.listen({ port: config.port, host: config.host });
} catch (erro) {
  app.log.error(erro);
  process.exit(1);
}
