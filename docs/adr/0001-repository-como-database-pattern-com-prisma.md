# 0001. Repository como Database Pattern, com Prisma por trás

- Status: aceito
- Data: 2026-11-10

## Contexto e problema

As regras R1 a R6 vivem em `src/domain/` e precisam ser testadas sem banco, sem
Fastify e sem I/O. Ao mesmo tempo, o fluxo principal grava alunos, pacotes,
disponibilidade e aulas em PostgreSQL, e a regra R3 (um aluno por horário) precisa
valer mesmo com duas reservas simultâneas.

Onde fica o acesso ao banco, de modo que o domínio não dependa dele e a R3 continue valendo?

## Fatores de decisão

- O domínio não pode importar Prisma (CLAUDE.md: dependências apontam para dentro).
- Os testes unitários e o de integração da API precisam rodar rápido, sem Docker.
- A R3 não pode depender só de "ler, validar, gravar" na aplicação, porque duas
  requisições simultâneas passariam juntas pela checagem.
- Projeto individual e curto: pouca cerimônia, mas com fronteiras que eu consiga explicar.

## Alternativas consideradas

1. **Repository como Database Pattern** (escolhida): interfaces de repositório no
   domínio (`src/domain/repositorios.ts`), implementadas em memória e com Prisma.
2. **Casos de uso chamando o Prisma direto**: sem camada intermediária.
3. **Active Record**: cada entidade grava a si mesma (`aula.salvar()`).

## Decisão

Adotamos o **Repository** como porta de persistência. O domínio e os casos de uso
conhecem apenas as interfaces (`AlunoRepository`, `PacoteRepository`,
`DisponibilidadeRepository`, `AulaRepository`). Há duas implementações:
`src/infra/memoria/` e `src/infra/prisma/`. Um **teste de contrato compartilhado**
(`tests/infra/contrato-de-repositorios.ts`) roda contra as duas, garantindo que se
comportam igual. A R3 é garantida também no armazenamento, por um índice único parcial,
e `AulaRepository.salvar` lança `HorarioOcupado` quando ele é violado.

## Consequências

- Bom: o domínio e os casos de uso são testados sem banco; os testes da API usam a
  implementação em memória e rodam em milissegundos.
- Bom: trocar o Prisma por outro acesso a dados não toca em regra de negócio.
- Bom: a R3 vale sob concorrência, porque quem decide é o banco, não a checagem prévia.
- Ruim: duas implementações para manter em sincronia. Mitigação: o contrato
  compartilhado falha se divergirem.
- Ruim: mais arquivos e uma camada a mais do que chamar o Prisma direto, o que é
  exagero para um CRUD simples. Aqui se justifica pelas regras de negócio e pela R3.

## Por que as outras alternativas foram descartadas

- **Prisma direto nos casos de uso**: mais curto, mas prenderia as regras ao Prisma e
  exigiria um Postgres em todo teste de caso de uso. Também espalharia o tratamento do
  erro de índice único (R3) pelos casos de uso.
- **Active Record**: mistura regra de negócio e persistência na entidade, o contrário
  de manter `src/domain/` puro. O Prisma também não oferece esse modelo.
