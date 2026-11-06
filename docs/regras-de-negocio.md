# Regras de negócio

Levantadas em conversa com o instrutor (cliente real do projeto).

## Contexto

Instrutor de trânsito autônomo que atende alunos de primeira habilitação e
condutores habilitados (perda do medo de dirigir, direção defensiva). Hoje ele
mesmo faz captação, cadastro e agendamento, muitas vezes pelo celular durante
as aulas. O sistema resolve **o agendamento**: o aluno marca a própria aula
sem precisar interromper o instrutor.

## Regras

| # | Regra | Valor atual | Configurável |
|---|-------|-------------|--------------|
| R1 | Aulas começam sempre em hora cheia (7h, 8h, 13h...) | — | não |
| R2 | Duração máxima da aula | 50 min | `DURACAO_AULA_MINUTOS` |
| R3 | Um aluno por horário (os 10 min restantes são o deslocamento) | — | não |
| R4 | Só é possível reservar dentro da disponibilidade publicada pelo instrutor | — | não |
| R5 | O aluno só reserva se tiver saldo de aulas no pacote | — | não |
| R6 | Cancelar com antecedência mínima devolve o crédito; depois disso, a aula é consumida | 48 h | `CANCELAMENTO_ANTECEDENCIA_HORAS` |

## Fora do escopo

- **Captação, venda e pagamento:** continuam com o instrutor, por decisão do negócio.
- **Agendamento de provas:** é feito no Detran. O sistema no máximo registra a data.
- **Registro oficial das aulas:** é feito pelo instrutor no sistema da Senatran.
  Este sistema organiza a agenda e não substitui esse registro.

## A confirmar com o instrutor

- Quantos alunos ele atende por semana, e quantos perdeu por falha de agendamento.
