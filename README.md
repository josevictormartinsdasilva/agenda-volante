**Nível: Projeto B**

# Agenda Volante

API de agendamento de aulas para instrutor de trânsito autônomo: uma agenda para quem
trabalha em movimento. O aluno consulta os horários livres e reserva a própria aula,
sem precisar interromper o instrutor (que hoje agenda pelo celular, muitas vezes
durante as aulas).

Regras de negócio e escopo: [`docs/regras-de-negocio.md`](docs/regras-de-negocio.md).

## Como subir

Pré-requisito: Docker com Docker Compose.

```bash
docker compose up --build
```

A API sobe em http://localhost:3000. Teste com:

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

Para mudar portas, senha do banco ou regras de negócio, copie `.env.example`
para `.env` e ajuste. O `.env` nunca vai para o repositório.

## Observabilidade

- **Logs:** JSON estruturado (pino), um por requisição.
- **Métrica:** `GET /metrics` expõe `http_request_duration_seconds` (método, rota, status)
  no formato do Prometheus.
- **SLO:** disponibilidade de 99% e p95 abaixo de 300 ms no fluxo de consulta e reserva.
  Detalhes e como medir em [`docs/slo.md`](docs/slo.md).

```bash
curl http://localhost:3000/metrics
```

## Como testar

Pré-requisito: Node.js 22.

```bash
npm ci
npm run lint
npm test               # testes
npm run test:coverage  # testes + coverage mínimo (falha abaixo de 80% de linhas)
```

## Estrutura

```
src/          código da aplicação
tests/        testes automatizados
docs/         regras de negócio, ADR, OpenAPI, desempenho, uso de IA
.github/      pipeline de CI
```

## Próximos passos (fora do escopo desta entrega)

- Autenticação: hoje os endpoints do instrutor e o `/metrics` ficam abertos; em produção,
  proteger o instrutor e expor `/metrics` só em rede interna
- Subir um Prometheus para medir o SLO de forma contínua
- Atualizar Prisma para a versão 7 e Vitest para a 5: o `npm audit` aponta vulnerabilidades
  em dependências transitivas (`deepmerge-ts`, `tinypool`, `minimatch`) que só se corrigem
  com essas versões maiores. Avaliadas como sem exposição na API (afetam o CLI do Prisma e
  as ferramentas de teste e lint), e não foram atualizadas para não arriscar a entrega

- Lembretes de aula por WhatsApp
- Registro de pacotes vendidos e pagamentos
