# 0004. Limite de tentativas de login em memória e métricas numa porta interna

- Status: aceito
- Data: 2026-11-16

## Contexto e problema

Depois da autenticação (ADR 0003) sobraram três brechas antes de expor a API:

1. O login aceitava tentativas ilimitadas: dava para testar senhas de um aluno sem parar.
2. Sessões vencidas só eram apagadas quando alguém tentava usá-las; as abandonadas ficavam
   na tabela para sempre.
3. `GET /metrics` ficava na mesma porta pública da API, sem login, mostrando rotas, volume e
   taxa de erro para qualquer um.

## Fatores de decisão

- Nenhum segredo novo em configuração (a mesma linha do ADR 0003).
- Hoje roda uma instância da API; não vale montar infraestrutura para várias ainda.
- Requisições simultâneas não podem furar o limite.
- O limite não pode virar um jeito fácil de um atacante trancar a conta de um aluno.

## Alternativas consideradas

Para o limite de login:

1. **Contador próprio em memória, por e-mail e por IP** (escolhida).
2. **Plugin `@fastify/rate-limit`** na rota de login.
3. **Contador no Postgres** (ou Redis), compartilhado entre instâncias.

Para o `/metrics`:

1. **Porta interna separada, não publicada** (escolhida).
2. **Token fixo em variável de ambiente** (`Authorization: Bearer` que o Prometheus envia).
3. **Exigir login de administrador**.

## Decisão

- **Limite de login** (`src/application/limite-de-tentativas.ts`): janelas fixas de 15
  minutos, com até 5 tentativas por e-mail e 20 por IP, todos configuráveis
  (`LOGIN_MAX_TENTATIVAS_POR_EMAIL`, `LOGIN_MAX_TENTATIVAS_POR_ORIGEM`,
  `LOGIN_JANELA_MINUTOS`). Passou do limite, a resposta é `429` com `Retry-After`, mesmo
  com a senha certa, até a janela acabar.
  - A tentativa é contada **antes** de conferir a senha e sem `await` no meio: 100
    requisições paralelas não passam juntas.
  - Login certo zera os erros do e-mail e devolve a tentativa ao IP: vários alunos na mesma
    rede não se bloqueiam.
  - A origem é conferida primeiro: um IP já barrado não continua gastando o limite de
    e-mails alheios.
  - E-mail sem conta também é limitado, para a resposta não revelar quais e-mails existem.
  - O IP vem de `req.ip`. Atrás de proxy, `TRUST_PROXY=true` faz o Fastify ler o
    `X-Forwarded-For`; sem proxy fica desligado, senão o cliente forjaria o próprio IP.
- **Sessões vencidas:** uma tarefa (`src/tarefas.ts`) roda na subida e a cada hora e apaga
  as vencidas com um único `DELETE` pelo índice de `expiraEm`.
- **Métricas:** o `/metrics` sai da API e vai para uma segunda aplicação Fastify, na porta
  `METRICS_PORT` (padrão 9100), que o Compose não publica. Quem está na rede do Compose
  (um Prometheus) coleta; quem só alcança a porta 3000 recebe `404`.

## Consequências

- Bom: adivinhar senha passa a custar 5 tentativas a cada 15 minutos por conta.
- Bom: nenhuma dependência e nenhum segredo novos.
- Bom: as métricas deixam de vazar, e a coleta não aparece misturada nas medições da API.
- Ruim: o contador fica em memória. Zera quando a API reinicia e não é compartilhado entre
  instâncias; com mais de uma, cada uma teria o seu limite. A troca por um contador no
  banco ou no Redis fica atrás da mesma classe.
- Ruim: um atacante consegue travar o login de um aluno por 15 minutos errando a senha
  dele 5 vezes. É o preço de proteger a senha; a janela curta limita o estrago. Avisar o
  aluno por e-mail e permitir desbloqueio pelo instrutor ficam para depois.
- Ruim: atrás de um proxy sem `TRUST_PROXY=true`, todos os clientes parecem vir do mesmo IP
  e dividem as 20 tentativas. Isso precisa constar do roteiro de deploy (etapa 6).
- Ruim: em hospedagens que só expõem uma porta, o `/metrics` fica inalcançável de fora. É o
  objetivo, mas exige o coletor rodando na mesma rede.

## Por que as outras alternativas foram descartadas

- **`@fastify/rate-limit`:** limita por IP e por rota, mas não conhece o e-mail do corpo nem
  sabe se o login deu certo, que é o que separa "aluno errou a senha" de "senha sendo
  adivinhada". Seria uma dependência a mais para metade do comportamento.
- **Contador no Postgres ou Redis:** é o certo com várias instâncias, mas hoje é uma só.
  Traz uma escrita no banco a cada tentativa e, no caso do Redis, um serviço novo no Compose.
- **Token do `/metrics` em variável de ambiente:** seria mais um segredo em `.env`, o que
  a etapa anterior decidiu evitar, e um segredo fixo que ninguém lembra de trocar.
- **Login de administrador no `/metrics`:** o Prometheus não faz login; precisaria de uma
  sessão que não expira, que é um token fixo com outro nome.
