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

**Ainda não medido.** Esta seção só recebe números copiados da saída real do k6; nenhum
valor é estimado. Depois de rodar `npm run smoke`, preencha:

| Item | Valor |
|---|---|
| Data da medição | _a preencher_ |
| Máquina (CPU, RAM, SO) | _a preencher_ |
| Docker / versão do k6 | _a preencher_ |
| p95 de `GET /horarios-livres` | _a preencher_ |
| p95 de `POST /aulas` | _a preencher_ |
| Taxa de falhas (`http_req_failed`) | _a preencher_ |
| Thresholds passaram? | _a preencher_ |

## Limites desta medição

- A API e o Postgres rodam na mesma máquina do k6, no Docker local: o número mostra o
  software, não a rede nem um servidor de produção.
- Carga baixa (5 usuários, 200 iterações): é um smoke, não um teste de capacidade.
- Cada reserva só toca o horário dela, então não exercita contenção no banco.
