# SLO

Objetivos de nível de serviço do fluxo que o aluno usa: consultar os horários livres e
reservar a aula. São as duas chamadas em que uma falha faz o instrutor perder um aluno.

**Escopo:** `GET /horarios-livres` e `POST /aulas`.

| # | Indicador (SLI) | Meta (SLO) | Janela |
|---|-----------------|------------|--------|
| SLO 1 | Disponibilidade: proporção de requisições sem resposta 5xx | 99% | 30 dias |
| SLO 2 | Latência: p95 do tempo de resposta | abaixo de 300 ms | 30 dias |

Erros 4xx (horário ocupado, saldo insuficiente, dados inválidos) **não** contam como falha:
são o sistema recusando corretamente um pedido que viola uma regra de negócio.

## Status das metas

As metas acima são **declaradas, ainda não medidas em produção**. A primeira medição virá
do smoke test do k6 e será registrada em [`desempenho.md`](desempenho.md). Se o p95
medido ficar longe de 300 ms, esta meta é revista com base no número, não no palpite.

## Por que esses valores

- **99%** em 30 dias admite cerca de 7 h de indisponibilidade por mês. É compatível com um
  serviço de um único instrutor, sem exigência de plantão, e ainda assim detecta uma API
  que cai com frequência.
- **300 ms** no p95 é o limite em que a resposta ainda parece imediata no celular do aluno.
  Os buckets do histograma incluem 0,3 s para checar essa meta sem interpolação.

## Como medir

Ambos saem da métrica `http_request_duration_seconds` exposta em `GET /metrics`
(rótulos `method`, `route` e `status_code`).

Disponibilidade (SLO 1), sobre as duas rotas do escopo:

```promql
1 - (
  sum(rate(http_request_duration_seconds_count{route=~"/horarios-livres|/aulas",status_code=~"5.."}[30d]))
  /
  sum(rate(http_request_duration_seconds_count{route=~"/horarios-livres|/aulas"}[30d]))
)
```

Latência p95 (SLO 2):

```promql
histogram_quantile(0.95,
  sum by (le) (rate(http_request_duration_seconds_bucket{route=~"/horarios-livres|/aulas"}[30d]))
)
```

Hoje não há Prometheus no projeto: as consultas acima servem de referência e a medição
inicial é feita pelo k6. Subir um Prometheus é um próximo passo.
