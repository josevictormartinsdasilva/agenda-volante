# Deploy numa VPS

Roteiro para pôr o Agenda Volante no ar com HTTPS, num servidor só, com o
[`docker-compose.prod.yml`](../docker-compose.prod.yml). O porquê das escolhas está no
[ADR 0008](adr/0008-deploy-em-vps-com-compose-e-caddy.md).

```
internet ──80/443──▶ proxy (Caddy, HTTPS) ──3000──▶ api ──5432──▶ db
                                                     └── 9100 (/metrics, só rede interna)
```

Só o Caddy publica portas. API, banco e métricas ficam na rede interna do Compose.

> **Backup:** a cópia automática do banco é a etapa 6b, ainda pendente. Até lá, faça a
> cópia manual da seção [Cópia manual do banco](#cópia-manual-do-banco) antes de cada
> atualização e não use o sistema com alunos reais.

## 1. O que contratar

- **VPS** com Ubuntu 24.04 LTS, 1 vCPU e 1 a 2 GB de RAM. É suficiente para um
  instrutor: o smoke de 13/11 rodou com folga numa máquina comum
  ([`desempenho.md`](desempenho.md)).
- **Datacenter no Brasil.** Hospedar fora conta como transferência internacional de dados
  pessoais (LGPD, art. 33) e precisaria de justificativa própria ([`lgpd.md`](lgpd.md)).
- **Um domínio** (ou subdomínio) em que você consiga criar registro DNS.

## 2. Preparar o servidor

Como root, só desta vez:

```bash
adduser deploy && usermod -aG sudo deploy
# copie sua chave pública para /home/deploy/.ssh/authorized_keys e teste o login com ela
```

Depois, como `deploy`:

```bash
# SSH só por chave, sem login de root
sudo sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/; s/^#\?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

# Firewall: SSH, HTTP e HTTPS, nada mais
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable

# Atualizações de segurança automáticas
sudo apt update && sudo apt install -y unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades
```

Instale o Docker Engine com o Compose seguindo a documentação oficial
(<https://docs.docker.com/engine/install/ubuntu/>) e ponha o usuário no grupo:
`sudo usermod -aG docker deploy` (saia e entre de novo no SSH).

> **Atenção:** porta publicada pelo Docker **passa por fora do `ufw`**. Por isso o
> Compose de produção publica só a 80 e a 443, e o teste
> `tests/deploy/compose-producao.test.ts` impede que outra porta apareça ali.

## 3. Apontar o domínio

No painel do seu DNS, crie um registro **A** do domínio (por exemplo
`agenda.seudominio.com.br`) para o IP da VPS. Confira antes de seguir:

```bash
dig +short agenda.seudominio.com.br   # tem que devolver o IP da VPS
```

Sem isso, o Caddy não consegue o certificado: o Let's Encrypt valida pela porta 80.

## 4. Configurar

```bash
git clone https://github.com/<usuario>/agenda-volante.git
cd agenda-volante
cp .env.example .env
chmod 600 .env
```

Edite o `.env` e defina pelo menos:

| Variável | Valor |
|---|---|
| `DOMINIO` | o domínio do passo 3, sem `https://` |
| `POSTGRES_PASSWORD` | gere com `openssl rand -hex 32` (hexadecimal: `/`, `+` e `=` do base64 quebrariam a `DATABASE_URL`) |
| `COMPOSE_FILE` | `docker-compose.prod.yml`, para que todo `docker compose` neste servidor use o arquivo de produção sem precisar do `-f` |

Os demais (regras de negócio, duração da sessão) têm padrão; veja o `.env.example`.
Sem `DOMINIO` ou `POSTGRES_PASSWORD`, o Compose recusa subir e diz qual falta.

## 5. Subir

```bash
docker compose up -d --build
docker compose ps        # api "healthy"; proxy e db "running"
curl https://agenda.seudominio.com.br/health
# {"status":"ok"}
```

Na primeira subida o Caddy leva alguns segundos para obter o certificado. Se o `curl`
falhar, veja `docker compose logs proxy`: o erro mais comum é DNS ainda não propagado ou
porta 80 fechada.

## 6. Primeira conta e instrutor

O administrador nasce de um comando que pede e-mail e senha no terminal (a senha não
aparece; o `exec` já dá ao comando um terminal de verdade, sem `-T`):

```bash
docker compose exec api npm run admin:criar
```

Depois, cadastre o instrutor pela API (a tela do administrador ainda não existe), como em
"Experimente o fluxo principal" no README, trocando `http://localhost:3000` pelo domínio.
O instrutor entra pelo navegador em `https://<DOMINIO>` e o aluno cria a conta por lá.

## Operação

```bash
docker compose logs -f api      # logs da API (JSON, um por requisição)
docker compose restart api      # reiniciar só a API
```

**Atualizar para uma versão nova:** faça antes a cópia manual do banco (abaixo), depois

```bash
git pull
docker compose up -d --build
```

A API aplica as migrations pendentes ao subir. Ela fica fora do ar por alguns segundos,
enquanto o contêiner novo sobe: aceitável para um instrutor, e o motivo de atualizar fora
do horário das aulas.

**Métricas** (porta interna, de dentro do servidor):
`docker compose exec api wget -qO- http://127.0.0.1:9100/metrics`.

### Cópia manual do banco

Paliativo até a etapa 6b. Gera um arquivo no formato do `pg_dump` e o traz para o seu
computador, fora da VPS (uma cópia que fica só na VPS some junto com ela):

```bash
# na VPS
docker compose exec -T db pg_dump -U agenda -Fc agenda > agenda-$(date +%F).dump
# no seu computador
scp deploy@<ip-da-vps>:agenda-volante/agenda-*.dump .
```

O arquivo tem dados pessoais dos alunos: guarde num lugar protegido e apague as cópias
antigas.

## O que este roteiro ainda não cobre

- Backup automático, com retenção e restauração testada: etapa 6b.
- Cópia do backup para fora da VPS (storage externo): depende de escolher um provedor.
- Monitoramento e alerta de queda: o `healthcheck` reinicia a API, mas ninguém é avisado.
- Atualização sem tempo fora do ar: exigiria duas instâncias da API e o limite de login
  compartilhado (ADR 0004).
