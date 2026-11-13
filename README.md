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
npx prisma generate    # gera o client do Prisma (necessário uma vez após o npm ci)
npm run lint
npm run lint:api       # valida docs/openapi.yaml (Spectral)
npm run typecheck
npm test               # testes
npm run test:coverage  # testes + coverage mínimo (falha abaixo de 80% de linhas)
```

Sem `TEST_DATABASE_URL`, o contrato dos repositórios roda só contra a implementação em
memória. O CI sobe um Postgres descartável e roda contra os dois.

## Smoke test de desempenho

Com a API no ar (`docker compose up --build`), em outro terminal:

```bash
npm run smoke   # k6 via Docker, sem instalar nada
```

Mede o p95 de consultar horários livres e reservar. Detalhes, thresholds e o resultado
medido em [`docs/desempenho.md`](docs/desempenho.md).

## API

Fluxo principal (contrato completo em [`docs/openapi.yaml`](docs/openapi.yaml)):

| Passo | Endpoint |
|---|---|
| Cadastrar aluno e registrar o pacote de aulas | `POST /alunos`, `POST /alunos/{id}/pacote` |
| Instrutor publica a disponibilidade | `POST /disponibilidades` |
| Aluno consulta os horários livres | `GET /horarios-livres` |
| Aluno reserva um horário | `POST /aulas` |
| Instrutor consulta a agenda do dia | `GET /agenda` |
| Aluno cancela (devolve o crédito com 48 h ou mais de antecedência) | `POST /aulas/{id}/cancelar` |

## Decisões de design

- **Domínio puro** em `src/domain/`: regras R1 a R6 sem Fastify, Prisma ou I/O.
- **Strategy** na política de cancelamento (R6), para trocar a regra sem mexer na reserva.
- **Repository** com Prisma como Database Pattern: ADR em
  [`docs/adr/0001-repository-como-database-pattern-com-prisma.md`](docs/adr/0001-repository-como-database-pattern-com-prisma.md).

## Estrutura

```
src/          código da aplicação
tests/        testes automatizados
k6/           smoke test de desempenho
prisma/       schema e migrations
docs/         regras de negócio, ADR, OpenAPI, SLO, desempenho, uso de IA
.github/      pipeline de CI
```

## Próximos passos (fora do escopo desta entrega)

- Autenticação: hoje os endpoints do instrutor e o `/metrics` ficam abertos; em produção,
  proteger o instrutor e expor `/metrics` só em rede interna
- Subir um Prometheus para medir o SLO de forma contínua
- Gravar a aula e o pacote na mesma transação (`$transaction` do Prisma): hoje `salvar(aula)`
  e `salvar(pacote)` são duas gravações separadas, e uma queda entre elas deixaria a aula
  reservada sem o crédito debitado. A R3 não é afetada, porque quem a garante é o índice
  único do banco
- Validar os corpos das requisições e respostas contra os schemas do `docs/openapi.yaml`:
  hoje o teste de aderência confere rotas e status, mas não o formato dos corpos, então o
  contrato pode divergir da API sem o CI perceber. Usar os schemas do OpenAPI nas rotas do
  Fastify (ou um validador de contrato nos testes) fecharia essa lacuna
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

- **Saldo sob concorrência (R5 e R6):** reservar e cancelar leem o saldo, calculam e gravam,
  sem trava. Duas reservas simultâneas do mesmo aluno em horários diferentes podem ler o
  mesmo saldo e gastar mais créditos do que ele tem; dois cancelamentos simultâneos da
  mesma aula podem devolver o crédito duas vezes. A R3 está protegida pelo índice único,
  mas o saldo não. Correção: decremento atômico no banco (`saldo >= 1` na própria
  atualização), restrição `CHECK (saldo >= 0)` e mudança de status condicionada a
  "ainda reservada", tudo na mesma transação
- **Falhar ao subir sem banco em produção:** sem `DATABASE_URL`, `src/server.ts` cai para a
  memória e só registra um log; em produção isso perderia os dados no primeiro reinício.
  Recusar a subida quando `NODE_ENV=production` e a variável faltar
- **Encerramento limpo do contêiner:** o `CMD` roda `sh -c "prisma migrate deploy && node ..."`,
  e o `sh` pode não repassar o `SIGTERM` ao Node, então o `docker stop` espera o prazo e
  mata o processo. Usar `exec node ...` ou um init (`tini`) e tratar o sinal para fechar o
  Fastify e o Prisma
- **Readiness de verdade:** `/health` responde `ok` sem tocar no banco, então a API parece
  saudável mesmo com o Postgres fora. Separar liveness de readiness (com uma consulta
  simples ao banco) e adicionar `healthcheck` ao serviço `api` no Compose
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
- **Testes e cobertura:** o ramo de erro 500 de `src/routes/erros-http.ts` (84% de cobertura)
  não tem teste, e não há teste de concorrência para o saldo. `repositorios.ts` e `tipos.ts`
  aparecem com 0% por serem só tipos; excluí-los da cobertura deixaria o relatório fiel
