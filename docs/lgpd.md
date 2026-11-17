# Dados pessoais (LGPD)

O que o sistema guarda sobre pessoas, por quê e por quanto tempo. Vale para a versão com
contas de acesso (etapa 4 da fase 2).

> **Rascunho técnico, não parecer jurídico.** Foi escrito por mim com apoio de IA a partir
> da Lei 13.709/2018. Antes de pôr o sistema em uso com alunos reais, a base legal, os
> prazos e o texto de aviso ao aluno precisam ser validados com quem entende do assunto.

## Papéis

- **Controlador:** o instrutor, que decide para que os dados são usados.
- **Operador:** quem hospeda e mantém o sistema para ele (hoje, eu).
- **Titulares:** os alunos, o instrutor e quem tem conta de administrador.

## O que é guardado

| Dado | Onde | Para quê |
|---|---|---|
| Nome do aluno | `Aluno.nome` | O instrutor saber de quem é a aula na agenda |
| E-mail | `Usuario.email` | Identificar a conta no login (aluno, instrutor e administrador) |
| Hash da senha | `Usuario.senhaHash` | Conferir a senha no login. A senha em si nunca é guardada (scrypt com sal) |
| Sessões | `Sessao` | Manter o login. Guarda o resumo (SHA-256) do token, o papel e a validade |
| Código de redefinição | `CodigoDeRedefinicao` | Redefinir a senha esquecida. Guarda o resumo do código e a validade (1 hora); apagado no uso |
| Aulas e saldo | `Aula`, `Pacote` | O serviço em si: agenda e créditos |

**No navegador:** um único cookie, `sessao`, com o token do login (`HttpOnly`, só para este
site, vence com a sessão). É estritamente necessário para o login funcionar; não há cookie
de análise, publicidade ou de terceiros, nem nada em `localStorage`.

**Não é guardado:** CPF, telefone, endereço, data de nascimento, dados de pagamento, dados
de saúde ou qualquer dado sensível. Os logs da aplicação registram método, rota, status e
duração; não registram corpo de requisição, e-mail, senha nem token.

## Base legal (a validar)

Execução de contrato (art. 7º, V): o aluno contratou aulas com o instrutor, e nome, e-mail
e agenda são o mínimo para ele marcar essas aulas. Por isso o cadastro não pede
consentimento separado: não há uso além do serviço contratado (nada de marketing nem
compartilhamento com terceiros). Se um uso novo aparecer, como lembretes por WhatsApp,
ele precisa de base própria antes de ser implementado.

## Retenção

| Dado | Prazo | Situação |
|---|---|---|
| Sessão | Expira em `SESSAO_DURACAO_HORAS` (padrão 7 dias) ou no logout | Implementado. A sessão vencida é recusada e apagada no uso, e uma tarefa apaga as demais a cada hora |
| Conta, nome e e-mail | Enquanto o aluno quiser | Implementado: o aluno exclui a conta (`DELETE /conta`); e-mail, senha e sessões são apagados e o nome é substituído por "Aluno removido" |
| Aulas e saldo | A definir com o instrutor (histórico das aulas dadas) | **Falta** definir |

## Direitos do titular

| Direito (art. 18) | Situação |
|---|---|
| Acesso aos dados | Parcial: o aluno vê as próprias aulas e o saldo (`GET /minhas-aulas`); não há endpoint com nome e e-mail |
| Correção | Parcial: a senha muda (`POST /conta/senha`); **falta** corrigir nome e e-mail |
| Eliminação | Implementado: `DELETE /conta` apaga a conta e anonimiza o aluno. As aulas passadas ficam, sem o nome, como histórico do instrutor (**a validar**: se isso basta como anonimização) |
| Portabilidade | **Falta** |

Enquanto esses fluxos não existem, o pedido é atendido à mão pelo instrutor ou por mim,
direto no banco. Isso serve para um piloto pequeno, não para vender o sistema.

## Segurança

- Senha com scrypt e sal aleatório por conta; comparação em tempo constante.
- Token de sessão aleatório de 256 bits; o banco guarda só o resumo dele.
- Login responde igual para e-mail desconhecido e senha errada.
- Cada aluno só reserva e cancela as próprias aulas; só o instrutor lista alunos.
- Limite de tentativas de login: 5 por e-mail e 20 por IP a cada 15 minutos (ADR 0004).
- `/metrics` fora da porta pública: só a rede interna alcança.
- **Falta:** HTTPS (depende do deploy), troca e recuperação de senha, e um plano de
  resposta a incidente.

## Antes de usar com alunos reais

1. Validar a base legal e este documento.
2. Escrever o aviso de privacidade que o aluno lê ao criar a conta.
4. Servir só por HTTPS (e, atrás de proxy, `TRUST_PROXY=true`).
5. Definir com o instrutor o prazo de guarda do histórico de aulas.
