# Desempenho

Smoke test do fluxo principal com [k6](https://k6.io): para cada iteração, consulta os
horários livres do dia (`GET /horarios-livres`) e reserva um horário (`POST /aulas`).
É o que mede os SLOs de [`slo.md`](slo.md).

## Como rodar

Com a API no ar (`docker compose up --build`), em outro terminal:

```bash
npm run smoke
```

O script é [`k6/smoke.js`](../k6/smoke.js) e roda o k6 pelo Docker (`grafana/k6`), sem
instalar nada. Variáveis opcionais: `BASE_URL` (padrão `http://host.docker.internal:3000`
no `npm run smoke`) e `ITERACOES` (padrão 200).

Cenário: 5 usuários virtuais compartilham 200 iterações. O `setup()` cadastra um aluno
com 200 aulas de saldo e publica 200 horários em hora cheia; cada iteração usa um horário
próprio, então não há disputa por horário (R3) e todo `201` é esperado.

Thresholds (o k6 sai com erro se algum falhar):

| Métrica | Limite | Relaciona-se com |
|---|---|---|
| `http_req_duration{endpoint:horarios_livres}` p95 | < 300 ms | SLO 2 |
| `http_req_duration{endpoint:reservar}` p95 | < 300 ms | SLO 2 |
| `http_req_failed` | < 1% | SLO 1 |

## Resultado medido

Números copiados da saída real do `npm run smoke` (API e Postgres via
`docker compose up --build` em clone limpo; nenhum valor é estimado):

| Item | Valor |
|---|---|
| Data da medição | 13/11/2026 |
| Máquina (CPU, RAM, SO) | Windows 11 Home; CPU Intel64 Family 6 Model 142 Stepping 10 GenuineIntel ~1792 Mhz e RAM 16 GB |
| Docker / versão do k6 | Docker 29.9.2; versão do k6 k6 v2.4.0 (commit/dd9395906d, go1.27.3, linux/amd64) (imagem `grafana/k6`) |
| p95 de `GET /horarios-livres` | 83,15 ms |
| p95 de `POST /aulas` | 137,88 ms |
| p95 geral (todas as requisições) | 133,27 ms |
| Taxa de falhas (`http_req_failed`) | 0,00% (0 de 403 requisições) |
| Checks | 100% (800 de 800) |
| Thresholds passaram? | Sim: p95 < 300 ms nos dois endpoints e falhas < 1% |

**SLO cumprido** nesta medição: p95 abaixo de 300 ms e falhas abaixo de 1%. Foram 200
iterações com 5 usuários virtuais, em 5,4 s, a cerca de 75 requisições por segundo.

## Limites desta medição

- A API e o Postgres rodam na mesma máquina do k6, no Docker local: o número mostra o
  software, não a rede nem um servidor de produção.
- Carga baixa (5 usuários, 200 iterações): é um smoke, não um teste de capacidade.
- Cada reserva só toca o horário dela, então não exercita contenção no banco.
