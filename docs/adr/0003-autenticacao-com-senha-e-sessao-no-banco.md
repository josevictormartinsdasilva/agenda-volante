# 0003. Autenticação com e-mail e senha, e sessão guardada no banco

- Status: aceito
- Data: 2026-11-16

## Contexto e problema

Até a versão 0.2.0 a API não tinha autenticação: quem soubesse o `id` de um aluno
reservava e cancelava em nome dele, e qualquer pessoa publicava horários ou registrava
pacotes. Para o instrutor usar de verdade, cada chamada precisa dizer quem a faz e o que
essa pessoa pode fazer.

Decisão de produto, tomada por mim: o aluno entra com **e-mail e senha**, o instrutor
também tem **login com senha**, e existe uma conta de **administrador**, que cadastra os
instrutores. Restava decidir como guardar a senha, como manter o login entre as chamadas,
onde ficam as regras de permissão e como nasce a primeira conta.

## Fatores de decisão

- Dá para encerrar um login (logout, ou aparelho perdido).
- Nenhuma dependência nova com binário nativo: a imagem é `node:22-alpine`.
- O domínio continua sem conhecer HTTP nem criptografia.
- Guardar o mínimo de dado pessoal (ver `docs/lgpd.md`).
- Preciso conseguir explicar cada peça.

## Alternativas consideradas

Para manter o login:

1. **Token opaco com a sessão no banco** (escolhida).
2. **JWT assinado**, sem estado no servidor.
3. **Cookie de sessão** em vez de cabeçalho.

Para o hash da senha: **scrypt do Node** (escolhido), bcrypt ou argon2 por biblioteca.

Para a primeira conta: **comando de terminal** que cria o administrador (escolhido), ou
**credencial em variável de ambiente** criada na subida da API.

## Decisão

- **Senha:** scrypt (`node:crypto`) com sal aleatório por conta, no formato
  `scrypt:<sal>:<hash>`, comparado em tempo constante. Mínimo de 8 caracteres no cadastro.
- **Sessão:** o login gera um token aleatório de 256 bits, devolvido uma única vez. O banco
  guarda o SHA-256 dele na tabela `Sessao`, com papel, aluno e validade
  (`SESSAO_DURACAO_HORAS`, padrão 7 dias). O cliente envia `Authorization: Bearer <token>`.
- **Papéis:** `admin` cadastra instrutores e não opera a agenda; `instrutor` administra
  a agenda; `aluno` reserva e cancela as próprias aulas. A rota declara quem pode entrar
  (`guarda('instrutor')`), num gancho `onRequest` que roda antes da validação do corpo. A
  regra de posse ("o aluno só cancela a própria aula") fica no caso de uso.
- **Cadastro:** o aluno cria a própria conta (`POST /alunos`, pública); aluno e conta são
  gravados na mesma transação. O administrador cadastra instrutores (`POST /instrutores`).
- **Primeira conta:** o administrador nasce de `npm run admin:criar`, rodado no servidor
  (`docker compose exec api npm run admin:criar`). O comando pergunta e-mail e senha no
  terminal, sem ecoar a senha, e grava direto no banco. Não existe rota HTTP que crie
  administrador, e nenhuma credencial de conta fica em `.env`, Compose ou imagem.
- **Portas:** `UsuarioRepository` e `SessaoRepository` entram no mesmo contrato dos demais
  repositórios; hash de senha e geração de token são injetados nos casos de uso.

## Consequências

- Bom: logout de verdade, e basta apagar linhas de `Sessao` para derrubar um acesso.
- Bom: quem ler o banco não reutiliza sessões (só há o resumo do token) nem senhas.
- Bom: sem segredo de assinatura para guardar e girar, e sem biblioteca nova.
- Bom: um aluno que tenta mexer na aula de outro recebe `404`, sem saber que ela existe.
- Ruim: uma consulta a mais ao banco por requisição autenticada. `papel` e `alunoId` são
  copiados para a sessão para que seja uma só. **O p95 de `docs/desempenho.md` foi medido
  antes disto e precisa ser medido de novo.**
- Ruim: `papel` e `alunoId` duplicados na sessão; se um dia o papel mudar, as sessões
  abertas ficam com o antigo até expirar.
- Ruim: senha traz deveres que ainda não foram cumpridos: limite de tentativas de login,
  troca e recuperação de senha, exclusão de conta. Estão no plano como etapas seguintes.
- Bom: criar administrador exige acesso ao servidor; quem só alcança a API não consegue.
- Ruim: um passo manual depois do primeiro `docker compose up`, e o smoke k6 passa a
  precisar das credenciais de um administrador.
- A confirmar: as tabelas novas e o índice único do e-mail só foram exercitados em memória
  e com client falso; o contrato contra o Postgres roda na CI.

## Por que as outras alternativas foram descartadas

- **JWT:** evita a consulta ao banco, mas não dá para revogar sem manter uma lista de
  tokens cancelados (que é uma tabela de sessão com outro nome), e exige guardar e girar um
  segredo de assinatura. Com um instrutor e dezenas de alunos, a consulta a mais não pesa.
- **Cookie:** bom para navegador (com `HttpOnly`), mas traz CSRF e CORS para resolver
  agora, antes de existir a interface web. Reavaliar na etapa 5.
- **bcrypt/argon2:** argon2 é a recomendação mais atual, mas as bibliotecas trazem binário
  nativo para compilar no Alpine. O scrypt já vem no Node e é aceito para senhas.
- **Credencial do primeiro usuário em variável de ambiente** (`INSTRUTOR_EMAIL` e
  `INSTRUTOR_SENHA`, criada na subida): foi a primeira versão desta etapa, descartada na
  revisão. A senha ficaria em `.env`, no ambiente do contêiner e no histórico do servidor;
  um padrão no Compose ("só para desenvolvimento") acabaria exposto em algum deploy; e o
  instrutor, que deve ser uma conta como as outras, viraria configuração.
- **Aluno cadastrado pelo instrutor com senha provisória:** o instrutor conheceria a senha
  do aluno e ganharia mais um trabalho manual, que é o que o sistema quer tirar dele.
