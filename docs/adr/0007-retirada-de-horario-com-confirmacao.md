# 0007. Retirada de horário publicado, com confirmação quando há aula reservada

- Status: aceito
- Data: 2026-11-17

## Contexto e problema

O instrutor publicava horários mas não conseguia retirá-los: um imprevisto (carro na
oficina, consulta médica) deixava o horário aberto para reserva. Retirar levanta duas
perguntas:

1. **Negócio:** o que acontece com a aula que já está reservada no horário?
2. **Concorrência:** a reserva lê a disponibilidade (R4) e só depois grava a aula. Se a
   retirada acontece nesse meio, fica uma aula reservada num horário que não está mais
   publicado. É a mesma família de corrida do ADR 0002, agora entre duas tabelas.

## Fatores de decisão

- O instrutor não pode cancelar a aula de um aluno sem perceber.
- O aluno não pode perder crédito por uma desistência que não foi dele.
- Nenhuma aula reservada pode ficar num horário retirado, nem sob concorrência, e a
  garantia vale nas duas implementações dos repositórios (mesmo teste de contrato).

## Alternativas consideradas (aula reservada no horário)

1. **Recusar e, com confirmação, cancelar devolvendo o crédito** (escolhida).
2. **Só recusar:** o instrutor cancela a aula antes pela agenda. É mais simples, mas o
   cancelamento comum segue R6 e, a menos de 48 h, o aluno perderia o crédito por culpa
   do instrutor.
3. **Cancelar direto, sem perguntar:** um toque errado na tela desmarcaria um aluno.

## Decisão

- `POST /disponibilidades/retirar` (instrutor) com `{ inicio, cancelarAula? }`.
  - Horário livre: é apagado e a resposta é `{ aulaCancelada: null }`.
  - Com aula reservada e sem `cancelarAula`: `409` e nada muda.
  - Com `cancelarAula: true`: na mesma transação, o horário sai, a aula é cancelada e
    o crédito volta ao aluno **qualquer que seja a antecedência**. R6 não se aplica,
    porque quem desistiu foi o instrutor.
  - Horário não publicado: `422` (o mesmo erro de R4). Horário que já começou ou já
    passou: `422`, porque faz parte do histórico.
- A tela "Horários" do instrutor deixa tocar num horário futuro publicado ou reservado.
  No reservado, a confirmação diz o nome do aluno e que o crédito volta.
- **Concorrência:** reserva e retirada se encontram na mesma linha de `Disponibilidade`.
  - A reserva, dentro da transação, chama `disponibilidade.travar(inicio)`, um
    `SELECT ... FOR SHARE`, antes de gravar a aula. Se o horário sumiu, lança
    `HorarioIndisponivel`.
  - A retirada **primeiro apaga** o horário e **só depois** procura aula reservada nele.
    O `DELETE` espera qualquer reserva que tenha travado a linha terminar. Como cada
    comando do Postgres (em `READ COMMITTED`) enxerga o que já foi confirmado, a busca
    seguinte vê a aula recém-gravada. No sentido contrário, a reserva que tenta travar
    uma linha apagada por uma retirada em andamento espera e, se a retirada confirmar,
    não encontra a linha.
  - `FOR SHARE`, e não `FOR UPDATE`: duas reservas do mesmo horário não se bloqueiam
    entre si (o índice único de R3 já decide entre elas); só a retirada espera.
  - O Prisma não expressa `FOR SHARE`, então `travar` usa `$queryRaw`, com parâmetro
    (sem concatenar texto).
  - Em memória, as transações já rodam uma por vez; a disponibilidade passou a entrar no
    retrato da transação, para a retirada ser desfeita quando o `409` é lançado.

Alternativa descartada para a concorrência: chave estrangeira de `Aula.inicio` para
`Disponibilidade.inicio`. Ela também bloquearia o `DELETE`, mas as aulas canceladas e as
passadas continuam apontando para o horário. Não daria para retirar um horário que teve
uma aula cancelada sem apagar o histórico ou mudar o modelo.

## Consequências

- Toda reserva faz uma consulta a mais, dentro da transação que já existia.
- O teste de contrato "reserva e retirada simultâneas" roda contra o Postgres só no CI;
  o ambiente da IA não tem Docker.
- O aluno não é avisado da retirada: ele vê a aula como cancelada em "minhas aulas" e o
  crédito de volta. Avisar fica para os lembretes (fora do escopo por ora).
- Retirar vários horários de uma vez (a semana inteira, por exemplo) não existe. A rota
  recebe um horário por vez.
