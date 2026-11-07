# Contribuidores

| Nome | O que fez |
|------|-----------|
| José Victor Martins da Silva | Projeto individual: levantamento com o cliente, código, testes, CI e documentação |

## Atividades realizadas

Trabalho individual, em ordem de entrega (plano em [`docs/plano.md`](docs/plano.md)).

| Data | Atividade |
|------|-----------|
| 06/11 | Levantamento das regras com o instrutor, escolha do nível B, repositório, README, Docker Compose (API + Postgres), TypeScript, ESLint e CI (install, lint, test) |
| 07/11 | Domínio das regras R1 a R6 em `src/domain/` com testes unitários; Strategy na política de cancelamento (R6); recusa de horário no passado |
| 08/11 | Casos de uso do fluxo principal (publicar disponibilidade, consultar horários livres, reservar, consultar a agenda do dia, cancelar) e rotas HTTP com mapeamento de erros de domínio para status |
| 08/11 | Repositórios por interface com implementação em memória e em Postgres (Prisma, migration e índice único parcial para R3); teste de contrato compartilhado; teste de integração do fluxo principal |
| 09/11 | Métrica `http_request_duration_seconds` em `/metrics` (prom-client), SLO declarado em [`docs/slo.md`](docs/slo.md) e varredura de segredos com gitleaks no CI |

## Uso de IA

O uso de IA no desenvolvimento está declarado, com o que foi aproveitado e o que foi
decidido diferente, em [`docs/ia.md`](docs/ia.md). As decisões de design e o código
entregue são de responsabilidade do autor.
