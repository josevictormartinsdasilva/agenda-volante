# Uso de IA

Registro dos prompts e decisões que importaram. A IA sugeriu; as decisões são minhas.

| Data | O que pedi | O que aproveitei | O que decidi diferente |
|------|------------|------------------|------------------------|
| 06/11 | Análise das diretrizes e escolha do nível | Recomendação do nível B (início do zero, individual, 7 dias) | |
| 06/11 | Modelagem das regras a partir das respostas do instrutor | Grade de hora cheia absorvendo o deslocamento | |
| 06/11 | Estrutura inicial (Compose, TS, ESLint, CI) | Separação `buildApp`/`server` para testar sem abrir porta | |
| 06/11 | Preparação para o Claude Code (CLAUDE.md, plano, comandos) | Contexto do projeto versionado no repo, permissões que bloqueiam `.env` e `git push` | |
| 06/11 | Sugestões de nome para a aplicação | "Agenda Volante": volante = direção e = móvel, como o instrutor autônomo | |
| 07/11 | Domínio das regras R1–R6 com testes escritos antes do código | Funções puras `reservarAula`/`cancelarAula`; Strategy na política de cancelamento (R6) | |
| 07/11 | Recusar reserva de horário passado | Erro `HorarioNoPassado`; `agora` injetado no pedido para manter o domínio puro | A IA apontou a lacuna; a decisão de implementar foi minha |
| 08/11 | Casos de uso, rotas Fastify e teste de integração do fluxo principal, testes primeiro | Interfaces de repositório no domínio; casos de uso orquestram as funções puras; mapa erro de domínio → status HTTP | Persistência em memória por enquanto, Prisma depois; sem autenticação (fora do escopo) |
| 08/11 | Prisma 6 + migration, repositórios Postgres, teste de contrato compartilhado, Postgres no CI | Índice único parcial para R3 no banco; mesmo contrato testado em memória e no Postgres; `DATABASE_URL` vazia cai para memória | Sem Docker local: o contrato do Postgres não foi executado por mim, só no CI |
| 09/11 | Métrica `http_request_duration_seconds` em `/metrics`, SLO e gitleaks no CI | Uma só métrica para os dois SLOs; rótulo `route` com o padrão da rota (cardinalidade baixa); Registry por app; bucket 0,3 s alinhado à meta de p95 | Metas do SLO (99% e 300 ms) são declaradas, não medidas: a medição fica para o k6 de 11/11 |
| 09/11 | Pendências do Docker: valor de `DATABASE_URL` (Compose e CI) e como rodar o contrato localmente | Postgres descartável na porta 5432 para o teste, em vez de publicar a porta do `db` no Compose | Executado e confirmado por mim: `docker compose up --build` e contrato contra o Postgres funcionaram |
| 10/11 | `docs/openapi.yaml`, Spectral (`npm run lint:api`, no CI), teste de aderência da API ao contrato e ADR 0001 | OpenAPI escrito à mão em vez de gerado por `@fastify/swagger` (sem plugin novo, mas pode divergir: o teste de aderência cobre rotas e status); ADR do Repository com Prisma, descartando Prisma direto e Active Record | O teste de aderência confere rotas e status, não valida o formato dos corpos contra os schemas; o ADR e os exemplos do YAML ainda precisam da minha revisão antes da entrega |
| 10/11 | Investigação das vulnerabilidades do `npm audit` | Não atualizar Prisma 7 e Vitest 5 antes da entrega (quebra de versão); registrado em "Próximos passos" do README | A avaliação de "sem exposição na API" é da IA, não foi verificada em código; `npm audit fix` sem `--force` não alterou nada |
