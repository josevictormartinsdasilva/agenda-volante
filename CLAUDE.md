# Agenda Volante — contexto para o Claude Code

Leia este arquivo inteiro antes de qualquer tarefa. Ele substitui a conversa em
que o projeto foi planejado, que você não tem.

## O que é este projeto

Trabalho final de uma mini graduação de engenharia de software (Full Cycle).
**Nível B**: uma API de domínio único com um fluxo principal funcionando de ponta a ponta.
Desenvolvimento **individual**. Entrega pelo Moodle **até 13/11/2026**; commits depois
disso não são avaliados.

O cliente é real: um instrutor de trânsito autônomo (a resolução do Contran de dez/2025
permitiu aulas práticas fora de autoescola). Hoje ele agenda as aulas pelo celular,
muitas vezes durante as próprias aulas. **O sistema resolve só o agendamento**: o aluno
consulta os horários livres e reserva sem interromper o instrutor.

- Regras de negócio e escopo: @docs/regras-de-negocio.md
- Plano dia a dia e status: @docs/plano.md

## Rubrica (o que a nota avalia)

| Critério | Peso |
|---|---|
| M1 Funciona, código e design (Compose em 1 comando, SOLID, 1 pattern justificado) | 35 |
| M2 Testes unitários do domínio, 1 teste de integração, coverage mínimo, CI verde | 20 |
| M3 `.env.example`, segredos fora do repo, logs estruturados, 1 métrica, 1 SLO | 15 |
| M4 README do primeiro dia, 1 ADR, OpenAPI do endpoint principal, smoke k6 com p95 | 30 |

O que mais derruba nota: escopo inflado, CI vermelha, README que não sobe a aplicação,
segredos commitados, teste sem asserção e número sem medição.

## Stack

Node.js 22, TypeScript (strict, ESM/NodeNext), Fastify 5 (logger = pino),
Vitest + coverage v8, ESLint 9 (flat config), PostgreSQL 17 via Docker Compose.
Planejado: Prisma (Repository como Database Pattern), prom-client, Spectral, k6.

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

## Convenções

- Código, nomes de domínio, mensagens de erro, commits e docs em **português**.
  Termos técnicos consagrados podem ficar em inglês (handler, repository).
- Commits pequenos, no padrão Conventional Commits: `feat: reserva de aula valida saldo`.
- Regra de negócio nova: escreva o teste primeiro, com asserção de verdade.
- Datas: armazene em UTC; a grade de horários é no fuso `America/Fortaleza`.

## Regras de trabalho com este aluno

O autor é avaliado individualmente e precisa **saber explicar todo o código**.

- **Não faça commit nem push sem pedir.** Proponha a mensagem; ele executa ou autoriza.
- Ao tomar uma decisão de design, explique em 2 ou 3 frases o porquê e a alternativa
  descartada. Decisões relevantes viram ADR em `docs/adr/`.
- Ao fim de cada tarefa significativa, adicione uma linha em `docs/ia.md`
  (o curso exige declarar o uso de IA).
- **Não amplie o escopo.** Captação, pagamento, WhatsApp e agendamento de provas no
  Detran estão fora. Se algo parecer útil, sugira para "Próximos passos" no README.
- Nunca leia, crie com valores reais ou commite `.env`. Novas variáveis vão para
  `.env.example` com valor fictício.
- Se o plano do dia estiver atrasado, avise e sugira o que cortar, em vez de acelerar
  pulando testes ou documentação.
