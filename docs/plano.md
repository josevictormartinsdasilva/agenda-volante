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
| 4 | Autenticação: contas com e-mail e senha, login com sessão no banco, papéis admin, instrutor e aluno nas rotas, comando `admin:criar` para a primeira conta, ADR 0003 e `docs/lgpd.md` | feito em 16/11. **Falta confirmar na CI** as tabelas novas no Postgres e **rodar o k6 de novo** (o p95 medido é de antes do login) e **testar o `admin:criar` no contêiner** (com TTY, a senha não pode aparecer) |
| 4b | Endurecer o login: limite de tentativas, limpeza das sessões expiradas e proteção do `/metrics` | feito em 16/11 (ADR 0004): 5 tentativas por e-mail e 20 por IP a cada 15 min, limpeza de sessões a cada hora, `/metrics` na porta interna 9100. **Falta conferir no Docker** que a 9100 não aparece fora do Compose |
| 4c | Conta do aluno: trocar senha, recuperar senha, excluir conta e `GET /minhas-aulas` | feito em 16/11 (ADR 0005): recuperação por código que o instrutor gera e repassa; gancho pronto para a recuperação por e-mail (sem rota). **Falta confirmar na CI** a tabela `CodigoDeRedefinicao` e o índice de `Aula.alunoId` |
| 5 | Interface web do aluno (celular): ver horários livres, reservar e cancelar | feito em 17/11 (ADR 0006): HTML e JS sem build em `web/`, servidos pela API; criar conta, entrar, marcar, cancelar, minhas aulas, trocar senha, redefinir com código, sair e excluir conta; sessão em cookie `HttpOnly`. Fluxo conferido num Chrome sem janela (13 passos). **Falta conferir no Docker e num celular de verdade** |
| 5b | Interface do instrutor: publicar horários, agenda do dia, pacotes e código de redefinição | feito em 17/11: agenda do dia (marcar e cancelar por um aluno), publicar horários com repetição semanal, alunos com saldo, pacote e código (com link para o WhatsApp). API ganhou `GET /sessoes/atual` e o saldo em `GET /alunos`. Roteiro no Chrome com 17 passos (aluno e instrutor). **Falta conferir no Docker e num celular de verdade** |
| 5c | Retirar horário publicado (API e tela), tratando aula já reservada nele | feito em 17/11 (ADR 0007): `POST /disponibilidades/retirar`; com aula reservada, `409` até o instrutor confirmar, e aí a aula é cancelada e o crédito volta sem R6; a reserva trava o horário (`FOR SHARE`) e a retirada apaga antes de procurar a aula. Tela "Horários": tocar num horário publicado ou reservado retira. Roteiro no Chrome com 11 passos. **Falta confirmar na CI** o contrato "reserva e retirada simultâneas" contra o Postgres e **conferir num celular de verdade** |
| 6 | Deploy em ambiente acessível ao instrutor, com backup do banco | pendente |
| 7 | Atualizar Prisma 7 e Vitest 5 (`npm audit`) | pendente |

Depois, para comercializar (ordem a decidir): mais de um instrutor, extrato de créditos, cadastro ampliado com LGPD, idempotência em
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
