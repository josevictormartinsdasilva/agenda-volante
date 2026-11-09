# Plano de entrega (Nível B)

Atualize o status ao concluir cada item. Entrega: **13/11/2026**.

| Dia | Entrega | Status |
|---|---|---|
| 06/11 | Repositório, README com nível, Compose (API + Postgres), TS, ESLint, CI (install, lint, test) | feito |
| 07/11 | `src/domain/` com as regras R1–R6 e testes unitários; Strategy ou outro pattern justificado | feito |
| 08/11 | Prisma + Repository, endpoints do fluxo principal, 1 teste de integração | feito. Contrato dos repositórios confirmado contra o Postgres real e `docker compose up --build` verificado em 09/11 |
| 09/11 | Métrica com prom-client em `/metrics`, SLO declarado, gitleaks no CI | feito (o job do gitleaks só roda no GitHub; confirmar no primeiro push) |
| 10/11 | `docs/openapi.yaml` + Spectral no CI, `docs/adr/0001-*.md` (MADR, com alternativa descartada) | pendente |
| 11/11 | Smoke test k6 e `docs/desempenho.md` com p95 medido | pendente |
| 12/11 | README do primeiro dia revisado, `docs/ia.md`, `CONTRIBUTORS.md`, teste em clone limpo | pendente |
| 13/11 | Folga, envio no Moodle (repo, README, link da CI verde), vídeo opcional | pendente |

## Fluxo principal (o que precisa funcionar de ponta a ponta)

1. Instrutor publica a disponibilidade (dias e horas cheias).
2. Aluno consulta os horários livres.
3. Aluno reserva um horário (valida R1–R5 e consome 1 crédito do pacote).
4. Instrutor consulta a agenda do dia.
5. Aluno cancela (R6: devolve o crédito só com 48 h ou mais de antecedência).

Apoio: cadastro de aluno e registro do pacote de aulas vendido.
