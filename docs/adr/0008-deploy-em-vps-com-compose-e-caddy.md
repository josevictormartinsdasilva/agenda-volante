# 0008. Deploy numa VPS com Docker Compose e Caddy

- Status: aceito
- Data: 2026-11-23

## Contexto e problema

A API e as telas só rodavam na máquina do autor. Para o instrutor usar, o sistema precisa
de um endereço público com HTTPS: sem ele, o cookie da sessão (`Secure`, ADR 0006) não
funciona, e senha e dados pessoais trafegariam em claro. A etapa 6 do plano pede deploy e
backup; ela foi dividida em 6a (este ADR: pôr no ar com HTTPS) e 6b (backup).

## Fatores de decisão

- Não regredir o `docker compose up --build` de desenvolvimento.
- Dados pessoais dos alunos no Brasil, de preferência (LGPD, art. 33).
- Custo baixo e previsível para um único instrutor.
- Poucas peças para um mantenedor só operar e explicar.
- Nada exposto além do necessário: banco e `/metrics` fora da internet (ADR 0004).

## Alternativas consideradas

**Onde hospedar**

1. **VPS com o Docker Compose** (escolhida). Reaproveita a imagem e o Compose que já
   existem, custa pouco e permite escolher datacenter no Brasil. O preço é operar o
   servidor: atualizações, firewall e backup ficam por nossa conta.
2. **Plataforma gerenciada (Render, Railway, Fly) com Postgres deles.** Tira a operação do
   servidor e já traz backup, mas prende a configuração à plataforma, o plano com backup
   custa mais e nem todas têm região no Brasil.

**Como servir HTTPS**

1. **Caddy** (escolhido). Emite e renova o certificado sozinho, com um Caddyfile de poucas
   linhas, e descarta o `X-Forwarded-For` que vem do cliente, o que permite ligar
   `TRUST_PROXY` com segurança.
2. **nginx com certbot.** Mais conhecido, mas são duas peças, a renovação depende de uma
   tarefa agendada e a configuração de proxy e cabeçalhos é mais longa.
3. **Traefik.** Configurado por rótulos no Compose; poderoso para muitos serviços, mais do
   que este projeto precisa.

**Como organizar o Compose**

1. **Arquivo completo `docker-compose.prod.yml`** (escolhido). Repete parte do
   `docker-compose.yml`, mas o arquivo de produção se lê sozinho.
2. **Override sobre o `docker-compose.yml`.** Evitaria a repetição, mas no Compose as listas
   de `ports` se somam: a porta 3000 da API continuaria publicada, e a porta publicada pelo
   Docker passa por fora do firewall `ufw`. Removê-la exige `!reset`, fácil de esquecer.

## Decisão

- `docker-compose.prod.yml` com três serviços: `proxy` (Caddy, únicas portas publicadas:
  80 e 443), `api` e `db`, sem `ports` nos dois últimos.
- A API em produção liga `COOKIE_SEGURO=true` e `TRUST_PROXY=true` no próprio arquivo, não
  no `.env`: são consequência da arquitetura, não escolha de quem instala.
- Sem padrão para segredo nem domínio: `DOMINIO` e `POSTGRES_PASSWORD` usam `${VAR:?}` e o
  Compose recusa subir sem eles, em vez de cair numa senha conhecida como `agenda_dev`.
- `deploy/Caddyfile`: HSTS de um ano, compressão, sem o cabeçalho `Server`, só HTTP/1.1 e
  HTTP/2 (o HTTP/3 exigiria abrir a 443/udp).
- `restart: unless-stopped` e log do Docker limitado (5 arquivos de 10 MB) em todos os
  serviços, para a VPS não encher o disco.
- Roteiro em `docs/deploy.md`, com a preparação da VPS (SSH só por chave, `ufw`,
  atualizações automáticas).

## Como é verificado

- `tests/deploy/compose-producao.test.ts` lê o Compose e o Caddyfile e prende as garantias:
  só 80 e 443 publicadas, 9100 nunca, cookie seguro, proxy confiável, senha obrigatória,
  certificados em volume, HSTS e o proxy apontando só para `api:3000`.
- O job `producao` da CI sobe o `docker-compose.prod.yml` com `DOMINIO=localhost` (o Caddy
  usa a autoridade interna, sem Let's Encrypt) e confere: HTTPS com HSTS, redirecionamento
  do http, portas 3000, 5432 e 9100 fechadas de fora, `/metrics` com `404` pelo proxy e
  encerramento da API sem `SIGKILL`.

## Consequências

- O certificado real (Let's Encrypt) só é exercitado na VPS: depende de DNS e da porta 80.
- Atualizar derruba a API por alguns segundos (um contêiner só). Atualização sem tempo fora
  do ar exigiria duas instâncias e o limite de login compartilhado (ADR 0004).
- O servidor é responsabilidade do operador: aplicar atualizações e acompanhar o disco.
- Backup ainda não existe: até a etapa 6b, só a cópia manual do roteiro, e nada de alunos
  reais.
