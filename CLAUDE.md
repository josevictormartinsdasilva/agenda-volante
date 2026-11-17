# Agenda Volante — contexto para o Claude Code

Leia este arquivo inteiro antes de qualquer tarefa. Ele substitui a conversa em
que o projeto foi planejado, que você não tem.

## O que é este projeto

API de agendamento de aulas para instrutor de trânsito autônomo (a resolução do Contran
de dez/2025 permitiu aulas práticas fora de autoescola). O cliente é real: hoje ele agenda
as aulas pelo celular, muitas vezes durante as próprias aulas. **O sistema resolve o
agendamento**: o aluno consulta os horários livres e reserva sem interromper o instrutor.

- Regras de negócio e escopo: @docs/regras-de-negocio.md
- Plano e status: @docs/plano.md

## Fase atual

**Fase 1 (encerrada):** trabalho final da mini graduação Full Cycle, Nível B, entregue em
13/11/2026. A rubrica do curso não guia mais as decisões.

**Fase 2 (desde 16/11/2026):** o projeto segue como **portfólio**, com a intenção de
**comercializar depois**. O critério deixa de ser "o mínimo que a rubrica pede" e passa a
ser "o que um sistema usado por um instrutor de verdade precisa": primeiro não perder nem
corromper dado, depois segurança (autenticação, LGPD), depois funcionalidade. Sem prazo
fixo; a ordem está em `docs/plano.md`.

O que vem da fase 1 e não pode regredir: `docker compose up --build` em um comando, CI
verde, coverage mínimo, README que sobe a aplicação, segredos fora do repo e número só
com medição.

## Stack

Node.js 22, TypeScript (strict, ESM/NodeNext), Fastify 5 (logger = pino),
Vitest + coverage v8, ESLint 9 (flat config), PostgreSQL 17 via Docker Compose.
Prisma 6 (Repository como Database Pattern), prom-client, Spectral, k6.

## Comandos

```bash
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm test              # Vitest
npm run test:coverage # Vitest + coverage mínimo (o CI usa este)
npm run build         # compila para dist/
docker compose up --build
```

Antes de dizer que uma tarefa terminou, rode lint, typecheck e test:coverage. Tudo verde.

## Arquitetura

- `src/domain/`: regras de negócio puras. **Sem** Fastify, Prisma ou I/O. É aqui que ficam
  as regras R1 a R6, e é o que os testes unitários cobrem.
- `src/app.ts` monta a aplicação; `src/server.ts` só escuta a porta. Testes HTTP usam
  `app.inject()`, sem abrir porta.
- `src/config.ts`: toda configuração vem do ambiente. Valores de regra de negócio
  (48 h de cancelamento, aula de 50 min) são parâmetros, não constantes espalhadas.
- Dependências apontam para dentro: rotas → casos de uso → domínio. O domínio não
  conhece nada de fora (inversão de dependência via interfaces de repositório).
- Duas implementações dos repositórios (`src/infra/memoria/` e `src/infra/prisma/`), presas
  ao mesmo teste de contrato (`tests/infra/contrato-de-repositorios.ts`). Mudou a
  interface, mudam as duas e o contrato.
- Autenticação (ADR 0003): papéis `admin` (contas), `instrutor` (agenda) e `aluno`. A rota
  declara o papel exigido (`guarda('instrutor')`); a regra de posse ("o aluno só mexe na
  própria aula") fica no caso de uso. Rota nova nasce protegida, e o contrato OpenAPI diz
  se é pública (`security: []`).
- Nenhuma credencial de conta em `.env`, Compose ou imagem: o administrador nasce de
  `npm run admin:criar` (`src/criar-admin.ts`), rodado no servidor.
- Todo dado secreto de uso único (token de sessão, código de redefinição) vai para o banco
  como resumo (SHA-256), nunca em claro. Consumir é um comando condicionado, como em
  `codigos.consumir` (ADR 0005).
- `/metrics` fica numa segunda aplicação Fastify, na porta interna `METRICS_PORT`, que o
  Compose não publica (ADR 0004). Não o devolva para a porta pública.
- Concorrência: nunca "ler, calcular e gravar" um valor disputado. A condição vai no
  próprio comando de gravação (como `debitar` e `cancelar`) e gravações que precisam valer
  juntas vão em `emTransacao` (ADR 0002).

- `web/`: interface do aluno em HTML e JS sem build (ADR 0006). Texto da API ou do usuário
  entra sempre como texto (`append`, `textContent`), nunca como HTML; nada de script
  inline (a CSP bloqueia). Os módulos têm JSDoc e passam pelo `tsc` (`checkJs`).
  Funções puras ficam fora de `app.js` para terem teste em `tests/web/`.
- A sessão do navegador é o cookie `sessao` (`HttpOnly`, `SameSite=Strict`). Nunca guarde
  token em `localStorage`.

## Convenções

- Código, nomes de domínio, mensagens de erro, commits e docs em **português**.
  Termos técnicos consagrados podem ficar em inglês (handler, repository).
- Commits pequenos, no padrão Conventional Commits: `feat: reserva de aula valida saldo`.
- Regra de negócio nova: escreva o teste primeiro, com asserção de verdade.
- Datas: armazene em UTC; a grade de horários é no fuso `America/Fortaleza`.

## Regras de trabalho com este aluno

O autor mantém o projeto sozinho, usa-o como portfólio e precisa **saber explicar todo o código**.

- **Não faça commit nem push sem pedir.** Proponha a mensagem; ele executa ou autoriza.
- Ao tomar uma decisão de design, explique em 2 ou 3 frases o porquê e a alternativa
  descartada. Decisões relevantes viram ADR em `docs/adr/`.
- Ao fim de cada tarefa significativa, adicione uma linha em `docs/ia.md`
  (nasceu como exigência do curso; segue como registro de transparência do portfólio).
- **Não amplie o escopo por conta própria.** Siga a ordem de `docs/plano.md`. Captação,
  pagamento, WhatsApp e agendamento de provas no Detran seguem fora até o autor decidir
  o contrário. Se algo parecer útil, sugira para "Próximos passos" no README.
- Dado pessoal novo (telefone, e-mail, documento) só entra depois de tratar a LGPD
  (base legal, consentimento, retenção).
- O ambiente da IA não tem Docker nem Postgres: o contrato dos repositórios contra o
  banco real só roda no CI ou na máquina do autor. Diga isso em vez de afirmar que passou.
- Nunca leia, crie com valores reais ou commite `.env`. Novas variáveis vão para
  `.env.example` com valor fictício.
- Nunca acelere pulando testes ou documentação; se uma etapa ficou grande demais,
  proponha dividi-la.
