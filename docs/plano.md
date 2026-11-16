# Plano

Atualize o status ao concluir cada item.

## Fase 2: portfólio, rumo ao uso real (desde 16/11/2026)

Sem prazo fixo. A ordem é a prioridade: primeiro não corromper dado, depois operar com
segurança, depois o que o instrutor e o aluno enxergam. Uma etapa por vez.

| # | Entrega | Status |
|---|---|---|
| 1 | Saldo sob concorrência (R5 e R6): `creditar`/`debitar`/`cancelar` atômicos, `emTransacao`, `CHECK (saldo >= 0)`, testes de concorrência, ADR 0002 | feito em 16/11. **Falta confirmar na CI** o contrato contra o Postgres e a migration (sem Docker no ambiente da IA) |
| 2 | Robustez operacional: recusar a subida sem `DATABASE_URL` em produção; encerramento limpo no `SIGTERM`; readiness que consulta o banco e `healthcheck` no Compose | feito em 16/11. **Falta conferir no Docker** (sem Docker no ambiente da IA): `docker compose up --build` deixa a API `healthy`, e `docker stop` encerra em menos de 10 s com o log "encerrando a aplicação" |
| 3 | Contrato: schemas do `docs/openapi.yaml` validando corpos nas rotas do Fastify (ou nos testes) | feito em 16/11, nos testes: a entrada de cada rota é comparada com o contrato e as respostas do fluxo são validadas com Ajv. Achou e corrigiu uma divergência (`pattern` da `data`) |
| 4 | Autenticação: separar instrutor e aluno; proteger as rotas do instrutor e o `/metrics`. Decisão vira ADR | pendente |
| 5 | Interface web do aluno (celular): ver horários livres, reservar e cancelar | pendente |
| 6 | Deploy em ambiente acessível ao instrutor, com backup do banco | pendente |
| 7 | Atualizar Prisma 7 e Vitest 5 (`npm audit`) | pendente |

Depois, para comercializar (ordem a decidir): mais de um instrutor, remover
disponibilidade, extrato de créditos, cadastro ampliado com LGPD, idempotência em
`POST /aulas`, lembretes. Detalhes em "Próximos passos" do README.

## Fase 1: trabalho do curso (Nível B), entregue em 13/11/2026

| Dia | Entrega | Status |
|---|---|---|
| 06/11 | Repositório, README com nível, Compose (API + Postgres), TS, ESLint, CI | feito |
| 07/11 | `src/domain/` com as regras R1–R6 e testes unitários; Strategy na política de cancelamento | feito |
| 08/11 | Prisma + Repository, endpoints do fluxo principal, teste de integração | feito |
| 09/11 | Métrica em `/metrics`, SLO declarado, gitleaks no CI | feito |
| 10/11 | `docs/openapi.yaml` + Spectral no CI, ADR 0001 | feito |
| 11/11 | Smoke k6 e `docs/desempenho.md` | feito. Medido em 13/11: p95 de 83,15 ms (`GET /horarios-livres`) e 137,88 ms (`POST /aulas`), 0% de falhas, SLO cumprido |
| 12/11 | README do primeiro dia, `docs/ia.md`, `CONTRIBUTORS.md`, clone limpo com Compose | feito |
| 13/11 | Envio no Moodle | entregue (informado pelo autor em 16/11; a CI verde no GitHub não foi conferida pela IA) |

## Fluxo principal (o que precisa funcionar de ponta a ponta)

1. Instrutor publica a disponibilidade (dias e horas cheias).
2. Aluno consulta os horários livres.
3. Aluno reserva um horário (valida R1–R5 e consome 1 crédito do pacote).
4. Instrutor consulta a agenda do dia.
5. Aluno cancela (R6: devolve o crédito só com 48 h ou mais de antecedência).

Apoio: cadastro de aluno e registro do pacote de aulas vendido.
