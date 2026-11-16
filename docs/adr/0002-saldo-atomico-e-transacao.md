# 0002. Saldo alterado por operações atômicas, dentro de uma transação

- Status: aceito
- Data: 2026-11-16

## Contexto e problema

Reservar e cancelar seguiam o roteiro "ler o pacote, calcular o saldo novo, gravar".
Entre a leitura e a gravação outra requisição pode gravar, e o resultado era:

- duas reservas simultâneas do mesmo aluno, em horários diferentes, liam o mesmo saldo e
  gastavam 1 crédito para 2 aulas (R5 furada);
- dois cancelamentos simultâneos da mesma aula passavam juntos pela checagem de "já
  cancelada" (R6);
- dois pacotes registrados ao mesmo tempo: o segundo sobrescrevia o primeiro;
- aula e pacote eram duas gravações soltas: uma queda entre elas deixava a aula reservada
  sem o crédito debitado.

As três corridas foram reproduzidas em teste antes da correção
(`tests/application/casos-de-uso.test.ts`, "saldo sob concorrência"). A R3 não tinha o
problema, porque já era decidida pelo índice único do banco (ADR 0001).

Como garantir R5 e R6 sob concorrência sem levar regra de negócio para o banco nem
Prisma para o domínio?

## Fatores de decisão

- O domínio continua puro e os casos de uso continuam testáveis sem banco.
- A garantia tem de valer nas duas implementações (memória e Postgres), verificada pelo
  mesmo teste de contrato.
- Reservas de alunos diferentes não devem esperar umas pelas outras.
- Preciso conseguir explicar a solução em poucas frases.

## Alternativas consideradas

1. **Operações atômicas condicionais + transação** (escolhida): o repositório expõe
   `creditar`, `debitar` e `cancelar`, cada uma um único comando que checa e altera; os
   casos de uso agrupam as gravações em `emTransacao`.
2. **Trava pessimista** (`SELECT ... FOR UPDATE` no pacote) mantendo "ler, calcular, gravar".
3. **Isolamento `SERIALIZABLE`** com nova tentativa em caso de conflito.
4. **Trava otimista** com coluna de versão no pacote.

## Decisão

- `PacoteRepository` perde o `salvar(pacote)` e ganha `creditar(alunoId, quantidade)` e
  `debitar(alunoId)`. No Postgres, o débito é um `UPDATE ... SET saldo = saldo - 1 WHERE
  saldo >= 1 RETURNING`: se nenhuma linha volta, lança `SaldoInsuficiente`. Não existe mais
  como gravar um saldo calculado fora do banco.
- `AulaRepository` ganha `cancelar(id)`, um `UPDATE ... WHERE status = 'reservada'` que
  devolve se mudou alguma linha. Só quem muda o status devolve o crédito.
- `Armazenamento.emTransacao(trabalho)` é a unidade de trabalho: no Prisma, uma transação
  interativa (`$transaction`); em memória, uma fila (uma transação por vez) com retrato do
  estado, restaurado se o trabalho falha.
- A migration `saldo_nao_negativo` adiciona `CHECK (saldo >= 0)` como última barreira.
- As funções puras do domínio continuam validando R1 a R6 sobre o que foi lido, para dar o
  erro certo cedo. O armazenamento reaplica a condição no momento de gravar. É o mesmo
  desenho que a R3 já usava.

## Consequências

- Bom: R5 e R6 valem sob concorrência, e aula e pacote são gravados juntos ou nenhum.
- Bom: o saldo devolvido na resposta é o que o banco gravou, não um cálculo sobre dado velho.
- Bom: sem trava explícita; alunos diferentes não se bloqueiam.
- Ruim: a condição de R5 aparece em dois lugares (domínio e `debitar`). Mitigação: o
  contrato dos repositórios testa a do armazenamento, e os testes do domínio a outra.
- Ruim: o `pacote` que `reservarAula` e `cancelarAula` (domínio) devolvem deixou de ser
  gravado; os casos de uso usam só a aula e a decisão de devolver o crédito.
- Ruim: a transação em memória é uma aproximação (serializa tudo e só desfaz pacotes e
  aulas). Serve para os testes e para rodar sem banco, não para produção.
- A confirmar: o comportamento no Postgres real é verificado pelo contrato no CI; não há
  ainda um teste de carga com disputa de saldo (o smoke k6 não disputa).

## Por que as outras alternativas foram descartadas

- **Trava pessimista**: funciona, mas exige SQL cru para o `FOR UPDATE`, não cobre o aluno
  que ainda não tem linha de pacote e deixa passar qualquer caminho novo que esqueça a trava.
- **`SERIALIZABLE`**: correto sem mudar as consultas, mas obriga a tratar e repetir falhas
  de serialização em todo caso de uso, e a versão em memória não teria como imitar.
- **Trava otimista**: resolve com uma coluna a mais e nova tentativa na aplicação; o
  `WHERE saldo >= 1` dá o mesmo resultado sem coluna nem repetição.
