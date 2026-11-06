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

## Como testar

Pré-requisito: Node.js 22.

```bash
npm ci
npm run lint
npm test               # testes
npm run test:coverage  # testes + coverage mínimo (falha abaixo de 80% de linhas)
```

## Estrutura

```
src/          código da aplicação
tests/        testes automatizados
docs/         regras de negócio, ADR, OpenAPI, desempenho, uso de IA
.github/      pipeline de CI
```

## Próximos passos (fora do escopo desta entrega)

- Lembretes de aula por WhatsApp
- Registro de pacotes vendidos e pagamentos
