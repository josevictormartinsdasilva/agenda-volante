# Plano de entrega (Nível B)

Atualize o status ao concluir cada item. Entrega: **13/11/2026**.

| Dia | Entrega | Status |
|---|---|---|
| 06/11 | Repositório, README com nível, Compose (API + Postgres), TS, ESLint, CI (install, lint, test) | feito |
| 07/11 | `src/domain/` com as regras R1–R6 e testes unitários; Strategy ou outro pattern justificado | feito |
| 08/11 | Prisma + Repository, endpoints do fluxo principal, 1 teste de integração | feito. Contrato dos repositórios confirmado contra o Postgres real e `docker compose up --build` verificado em 09/11 |
| 09/11 | Métrica com prom-client em `/metrics`, SLO declarado, gitleaks no CI | feito (o job do gitleaks só roda no GitHub; confirmar no primeiro push) |
| 10/11 | `docs/openapi.yaml` + Spectral no CI, `docs/adr/0001-*.md` (MADR, com alternativa descartada) | feito (confirmar o Spectral e a CI verde no próximo push) |
| 11/11 | Smoke test k6 e `docs/desempenho.md` com p95 medido parcial: script `k6/smoke.js`, `npm run smoke` e README prontos; **falta rodar o k6 e preencher o p95 em `docs/desempenho.md`** (Docker/k6 indisponíveis no ambiente da IA) |
| 12/11 | README do primeiro dia revisado, `docs/ia.md`, `CONTRIBUTORS.md`, teste em clone limpo | parcial: README revisado (fluxo principal, decisões de design, ADR, `prisma generate`), `docs/ia.md` e `CONTRIBUTORS.md` atualizados; clone limpo (`npm ci`, lint, typecheck, test:coverage, build) verde. **Falta** `docker compose up --build` em clone limpo (Docker indisponível no ambiente da IA) e conferir o `.env.example` |
| 13/11 | Folga, envio no Moodle (repo, README, link da CI verde), vídeo opcional | pendente. Checklist abaixo, na ordem |

## Checklist de 13/11 (antes do envio)

Nenhum item depende de código novo; todos exigem o ambiente do autor (Docker, k6, GitHub).

- [ ] **Clone limpo + Compose:** clonar em pasta nova e rodar `docker compose up --build` (sem `.env`: o Compose tem padrões para tudo). Conferir `GET /health` e `GET /metrics`.
- [ ] **`.env.example`:** conferir que tem `PORT`, `HOST`, `LOG_LEVEL`, `DATABASE_URL`, `CANCELAMENTO_ANTECEDENCIA_HORAS`, `DURACAO_AULA_MINUTOS`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` e `TEST_DATABASE_URL`, todas com valores fictícios, e que nenhum segredo real foi commitado.
- [ ] **Smoke k6:** com a API no ar, `npm run smoke`; copiar o p95 e as falhas **da saída real** para `docs/desempenho.md` (nada de número estimado) e dizer se o SLO (p95 < 300 ms, falhas < 1%) foi cumprido.
- [ ] **ADR e OpenAPI:** revisar `docs/adr/0001-*.md` e os exemplos de `docs/openapi.yaml` (pendência registrada em `docs/ia.md`, 10/11).
- [ ] **Push e CI:** push da `develop`; confirmar CI verde, incluindo Spectral e gitleaks (só rodam no GitHub). Se algo falhar, corrigir antes de enviar.
- [ ] **README:** opcional, dizer que o Compose sobe sem `.env`; conferir que os comandos do "Como rodar" funcionam como escritos.
- [ ] **Envio no Moodle (até 13/11):** link do repositório, README e link da execução verde da CI. Commits depois do prazo não são avaliados.
- [ ] **Vídeo:** opcional, só se sobrar tempo.

Se algo atrasar, cortar nesta ordem: vídeo, ajuste opcional do README. Não cortar o p95 medido, a CI verde nem o teste em clone limpo.

## Fluxo principal (o que precisa funcionar de ponta a ponta)

1. Instrutor publica a disponibilidade (dias e horas cheias).
2. Aluno consulta os horários livres.
3. Aluno reserva um horário (valida R1–R5 e consome 1 crédito do pacote).
4. Instrutor consulta a agenda do dia.
5. Aluno cancela (R6: devolve o crédito só com 48 h ou mais de antecedência).

Apoio: cadastro de aluno e registro do pacote de aulas vendido.
