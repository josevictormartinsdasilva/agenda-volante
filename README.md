# Agenda Volante

**Nível: Projeto B**

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

O Compose sobe **sem nenhum `.env`**: ele tem padrões para tudo (porta 3000, banco `agenda`,
48 h de cancelamento, aula de 50 min). Para mudar portas, senha do banco ou regras de
negócio, copie `.env.example` para `.env` e ajuste. O `.env` nunca vai para o repositório.

Para parar e apagar os contêineres e os dados do banco:

```bash
docker compose down -v
```

### Experimente o fluxo principal

Com a API no ar, o fluxo de ponta a ponta com `curl` (Git Bash, macOS ou Linux). Use uma
data futura: a API recusa horário que já passou. O exemplo usa 10/03/2027, às 10h em
Fortaleza (`13:00Z`, porque os horários trafegam em UTC).

A API exige login, e nenhuma conta vem pronta: nem no `.env`, nem no Compose. A primeira
é a do **administrador**, criada por um comando que pergunta e-mail e senha no terminal
(a senha não aparece na tela). Com a API no ar:

```bash
docker compose exec api npm run admin:criar
```

O administrador só cadastra instrutores; quem opera a agenda é o instrutor.

```bash
# 1. Login do administrador (com o e-mail e a senha do comando acima); anote o "token"
curl -s -X POST http://localhost:3000/sessoes -H 'content-type: application/json' \
  -d '{"email":"<EMAIL_DO_ADMIN>","senha":"<SENHA_DO_ADMIN>"}'
ADMIN='authorization: Bearer <TOKEN_DO_ADMIN>'

# 2. O administrador cadastra o instrutor
curl -s -X POST http://localhost:3000/instrutores -H "$ADMIN" \
  -H 'content-type: application/json' \
  -d '{"email":"instrutor@exemplo.com","senha":"senha-do-instrutor"}'

# 3. O aluno cria a própria conta; anote o "id" da resposta
curl -s -X POST http://localhost:3000/alunos -H 'content-type: application/json' \
  -d '{"nome":"Ana","email":"ana@exemplo.com","senha":"uma-senha-longa"}'

# 4. Login do instrutor e do aluno; anote o "token" de cada resposta
curl -s -X POST http://localhost:3000/sessoes -H 'content-type: application/json' \
  -d '{"email":"instrutor@exemplo.com","senha":"senha-do-instrutor"}'
curl -s -X POST http://localhost:3000/sessoes -H 'content-type: application/json' \
  -d '{"email":"ana@exemplo.com","senha":"uma-senha-longa"}'

INSTRUTOR='authorization: Bearer <TOKEN_DO_INSTRUTOR>'
ALUNO='authorization: Bearer <TOKEN_DO_ALUNO>'

# 5. Instrutor registra um pacote de 10 aulas (troque <ALUNO_ID>)
curl -s -X POST http://localhost:3000/alunos/<ALUNO_ID>/pacote -H "$INSTRUTOR" \
  -H 'content-type: application/json' -d '{"quantidade":10}'

# 6. Instrutor publica dois horários (hora cheia)
curl -s -X POST http://localhost:3000/disponibilidades -H "$INSTRUTOR" \
  -H 'content-type: application/json' \
  -d '{"inicios":["2027-03-10T13:00:00.000Z","2027-03-10T14:00:00.000Z"]}'

# 7. Aluno consulta os horários livres do dia
curl -s 'http://localhost:3000/horarios-livres?data=2027-03-10' -H "$ALUNO"

# 8. Aluno reserva para si e anota o "id" da aula (consome 1 crédito: saldo 9)
curl -s -X POST http://localhost:3000/aulas -H "$ALUNO" \
  -H 'content-type: application/json' -d '{"inicio":"2027-03-10T13:00:00.000Z"}'

# 9. Instrutor consulta a agenda do dia
curl -s 'http://localhost:3000/agenda?data=2027-03-10' -H "$INSTRUTOR"

# 10. Aluno cancela (com 48 h ou mais de antecedência, o crédito volta: saldo 10)
curl -s -X POST http://localhost:3000/aulas/<AULA_ID>/cancelar -H "$ALUNO"

# 11. Logout do aluno
curl -s -X DELETE http://localhost:3000/sessoes/atual -H "$ALUNO"
```

Sem token a resposta é `401`; o aluno em rota do instrutor recebe `403`, e só mexe nas
próprias aulas. Reservar o mesmo horário de novo responde `409`; um horário não publicado, fora da hora
cheia ou sem saldo responde `422`, sempre com `{"erro": "..."}` em português.

## Observabilidade

- **Logs:** JSON estruturado (pino), um por requisição.
- **Saúde:** `GET /health` diz se o processo está de pé (não consulta nada); `GET /ready`
  diz se dá para atender, consultando o banco, e responde `503` se ele não responder em
  2 s. O Compose usa o `/ready` como `healthcheck` da API.
- **Métrica:** `GET /metrics` expõe `http_request_duration_seconds` (método, rota, status)
  no formato do Prometheus, numa **porta interna** (9100) que o Compose não publica: a
  porta 3000 da API responde `404` para `/metrics`.
- **SLO:** disponibilidade de 99% e p95 abaixo de 300 ms no fluxo de consulta e reserva.
  Detalhes e como medir em [`docs/slo.md`](docs/slo.md).

```bash
# De dentro do contêiner, que é onde a porta de métricas existe
docker compose exec api wget -qO- http://127.0.0.1:9100/metrics
```

## Como testar

Pré-requisito: Node.js 22.

```bash
npm ci
npx prisma generate    # gera o client do Prisma (necessário uma vez após o npm ci)
npm run lint
npm run lint:api       # valida docs/openapi.yaml (Spectral)
npm run typecheck
npm test               # testes
npm run test:coverage  # testes + coverage mínimo (falha abaixo de 80% de linhas)
```

Sem `TEST_DATABASE_URL`, o contrato dos repositórios roda só contra a implementação em
memória. O CI sobe um Postgres descartável e roda contra os dois.

O `docs/openapi.yaml` é escrito à mão, e o teste de aderência
(`tests/integracao/contrato-openapi.test.ts`) impede que ele se afaste da API: compara a
validação de entrada de cada rota com o schema do contrato e valida o corpo de cada
resposta do fluxo contra o schema documentado para aquele status.

## Smoke test de desempenho

Com a API no ar (`docker compose up --build`), em outro terminal:

```bash
# Precisa de um administrador (npm run admin:criar); o script cria o instrutor e o aluno
ADMIN_EMAIL=<email> ADMIN_SENHA=<senha> npm run smoke   # k6 via Docker, sem instalar nada
```

Mede o p95 de consultar horários livres e reservar. **A medição abaixo é da versão 0.1.0,
anterior à autenticação; o script já faz login, mas ainda não foi rodado de novo.**
Resultado medido em 13/11/2026
(5 usuários virtuais, 200 iterações, API e Postgres no Docker local):

| Métrica | Medido | Limite do SLO |
|---|---|---|
| p95 de `GET /horarios-livres` | 83,15 ms | < 300 ms |
| p95 de `POST /aulas` | 137,88 ms | < 300 ms |
| Falhas | 0,00% (0 de 403) | < 1% |

SLO cumprido nesta medição. É um smoke na mesma máquina, não um teste de capacidade.
Detalhes, thresholds e limites da medição em [`docs/desempenho.md`](docs/desempenho.md).

## API

Fluxo principal (contrato completo em [`docs/openapi.yaml`](docs/openapi.yaml)):

| Passo | Endpoint |
|---|---|
| Administrador cadastra instrutor (o administrador nasce de `npm run admin:criar`) | `POST /instrutores` |
| Aluno cria a conta; todos fazem login e logout | `POST /alunos`, `POST /sessoes`, `DELETE /sessoes/atual` |
| Instrutor lista os alunos e registra o pacote de aulas | `GET /alunos`, `POST /alunos/{id}/pacote` |
| Instrutor publica a disponibilidade | `POST /disponibilidades` |
| Aluno consulta os horários livres | `GET /horarios-livres` |
| Aluno reserva um horário | `POST /aulas` |
| Instrutor consulta a agenda do dia | `GET /agenda` |
| Aluno cancela (devolve o crédito com 48 h ou mais de antecedência) | `POST /aulas/{id}/cancelar` |

## Decisões de design

- **Autenticação:** e-mail e senha (scrypt), sessão por token guardada no banco e três
  papéis: administrador (contas), instrutor (agenda) e aluno. O primeiro administrador nasce
  de um comando de terminal, sem credencial em configuração. ADR em
  [`docs/adr/0003-autenticacao-com-senha-e-sessao-no-banco.md`](docs/adr/0003-autenticacao-com-senha-e-sessao-no-banco.md);
  dados pessoais em [`docs/lgpd.md`](docs/lgpd.md).
- **Domínio puro** em `src/domain/`: regras R1 a R6 sem Fastify, Prisma ou I/O.
- **Strategy** na política de cancelamento (R6), para trocar a regra sem mexer na reserva.
- **Repository** com Prisma como Database Pattern: ADR em
  [`docs/adr/0001-repository-como-database-pattern-com-prisma.md`](docs/adr/0001-repository-como-database-pattern-com-prisma.md).
- **Login e métricas:** até 5 tentativas de login por e-mail e 20 por IP a cada 15 minutos
  (`429` depois disso), sessões vencidas apagadas a cada hora e `/metrics` numa porta
  interna: ADR em
  [`docs/adr/0004-limite-de-login-e-metricas-em-porta-interna.md`](docs/adr/0004-limite-de-login-e-metricas-em-porta-interna.md).
  Atrás de um proxy, defina `TRUST_PROXY=true`, senão todos os clientes dividem o limite
  por IP.
- **Saldo sob concorrência:** o crédito só muda por operações atômicas (`creditar`,
  `debitar`), e aula e pacote são gravados na mesma transação: ADR em
  [`docs/adr/0002-saldo-atomico-e-transacao.md`](docs/adr/0002-saldo-atomico-e-transacao.md).

## Estrutura

```
src/          código da aplicação
tests/        testes automatizados
k6/           smoke test de desempenho
prisma/       schema e migrations
docs/         regras de negócio, ADR, OpenAPI, SLO, desempenho, LGPD, uso de IA
.github/      pipeline de CI
```

## Próximos passos

- Completar a autenticação antes de usar com alunos reais: troca e recuperação de senha e
  exclusão de conta. A lista está em [`docs/lgpd.md`](docs/lgpd.md)
- Limite de login compartilhado (Postgres ou Redis) quando houver mais de uma instância da
  API: hoje o contador é em memória (ADR 0004)
- O aluno ainda não tem como listar as próprias aulas (`GET /minhas-aulas`): hoje ele só
  conhece o `id` da aula pela resposta da reserva. Necessário para a interface web
- Medir o p95 de novo: o número de 13/11 é de antes da autenticação, que acrescenta uma
  consulta ao banco por requisição
- Subir um Prometheus para medir o SLO de forma contínua
- Atualizar Prisma para a versão 7 e Vitest para a 5: o `npm audit` aponta vulnerabilidades
  em dependências transitivas (`deepmerge-ts`, `tinypool`, `minimatch`) que só se corrigem
  com essas versões maiores. Avaliadas como sem exposição na API (afetam o CLI do Prisma e
  as ferramentas de teste e lint), e não foram atualizadas para não arriscar a entrega
- Lembretes de aula por WhatsApp
- Registro de pacotes vendidos e pagamentos
- Ampliar o cadastro do aluno: hoje ele tem só `id` e `nome`, de propósito, porque o sistema
  só agenda. Candidatos: telefone (para os lembretes), tipo de aluno (primeira habilitação
  ou condutor habilitado) e data da prova. Dado pessoal exige tratar a LGPD (base legal,
  consentimento, retenção) antes de guardar

### Próximos passos de arquitetura e robustez

Levantados na revisão final do código, em ordem aproximada de prioridade:

- **Disputa de saldo sob carga:** a corrida do saldo (R5 e R6) foi corrigida em 16/11/2026
  (ADR 0002) e tem teste de concorrência, mas o smoke k6 não disputa crédito nem horário.
  Um cenário de carga com vários pedidos do mesmo aluno confirmaria o comportamento no
  Postgres sob pressão
- **Readiness durante o encerramento:** o `/ready` continua respondendo `200` entre o
  `SIGTERM` e o fechamento. Atrás de um balanceador, responder `503` nesse intervalo
  tiraria a instância do rodízio antes de ela parar
- **Fuso configurável:** `-03:00` e o cálculo de hora cheia estão fixos em
  `src/domain/horario.ts`, válidos porque `America/Fortaleza` não tem horário de verão. Ler o
  fuso da configuração e usar `Intl` ou `Temporal` removeria a premissa
- **Mais de um instrutor:** o modelo assume um instrutor só (`Disponibilidade` tem o horário
  como chave e `Aula` não aponta para instrutor). Atender vários exige `instrutorId` nas
  duas tabelas e nas regras R3 e R4
- **Remover disponibilidade:** o instrutor publica horários mas não consegue retirá-los, nem
  tratar uma retirada que atinge aula já reservada
- **Idempotência em `POST /aulas`:** com internet instável no celular, um reenvio da mesma
  reserva volta como `409`. Aceitar um cabeçalho `Idempotency-Key` devolveria a resposta
  original
- **Limites e proteção de entrada:** `inicios` em `/disponibilidades` não tem `maxItems`, e
  `nome` não tem `maxLength`; faltam limite de requisições e política de CORS. Também
  versionar a API (`/v1`) e padronizar os erros no formato RFC 9457
- **Extrato de créditos:** `Pacote.saldo` é um contador mutável. Um registro de movimentações
  (compra, reserva, devolução, consumo) daria auditoria e explicaria qualquer saldo
- **Observabilidade de negócio:** só existe a métrica de duração HTTP. Contadores de reservas,
  cancelamentos e recusas por regra (`SaldoInsuficiente`, `HorarioOcupado`), além de um
  identificador de correlação nos logs, mostrariam o uso real
- **Organização do código:** `MS_POR_HORA` está repetida em `casos-de-uso.ts` e
  `politica-cancelamento.ts`, e a janela de uma hora da reserva está fixa no caso de uso.
  Centralizar em `src/domain/horario.ts`; se `casos-de-uso.ts` crescer, separar um arquivo por
  caso de uso
- **Testes e cobertura:** `repositorios.ts` e `tipos.ts` aparecem com 0% por serem só tipos;
  excluí-los da cobertura deixaria o relatório fiel
