# 0005. Redefinição de senha por código gerado pelo instrutor, com gancho para e-mail

- Status: aceito
- Data: 2026-11-16

## Contexto e problema

Com contas e senhas (ADR 0003), o aluno que esquece a senha precisa provar que é dono da
conta sem ela. O caminho comum é mandar um link ou código por e-mail, mas a API não envia
e-mail. Passar a enviar exige um provedor (conta e custo), um domínio com SPF e DKIM (que
depende do deploy, ainda sem domínio), uma chave de API em configuração, a confirmação do
e-mail no cadastro (hoje qualquer um cadastra qualquer e-mail) e mais um operador de dados
pessoais na LGPD.

Decisão de produto, tomada por mim: **por enquanto, o instrutor gera o código e o repassa
ao aluno**, como já faz com os recados pelo WhatsApp, deixando pronto o gancho para a
recuperação por e-mail.

## Fatores de decisão

- O instrutor nunca pode conhecer a senha do aluno.
- Nenhum serviço externo nem segredo novo agora.
- O código não pode ser adivinhado nem reaproveitado, nem usado duas vezes ao mesmo tempo.
- Trocar o canal depois (e-mail) não pode mudar a validação do código.

## Alternativas consideradas

1. **Código de uso único gerado pelo instrutor** (escolhida).
2. **Recuperação por e-mail já agora.**
3. **Instrutor define uma senha provisória** para o aluno.
4. **Sem recuperação:** ajuste manual no banco.

## Decisão

- `POST /alunos/{id}/codigo-de-redefinicao` (instrutor) gera um código de 8 símbolos em dois
  grupos (`K7QM-3XRA`), sem os caracteres que se confundem (0, O, 1, I, L). Vale
  `CODIGO_REDEFINICAO_MINUTOS` (padrão 60), serve uma vez e um código novo substitui o
  anterior (um por conta, na tabela `CodigoDeRedefinicao`).
- O banco guarda o SHA-256 do código, nunca o código, como já faz com o token de sessão.
- `POST /senha/redefinicao` (pública) recebe e-mail, código e senha nova. Consumir o
  código é um `DELETE` condicionado ao código e à validade: de dois usos simultâneos, só
  um apaga a linha (o mesmo desenho do ADR 0002). Na mesma transação, a senha muda e
  todas as sessões da conta caem.
- E-mail sem conta, código errado, usado ou vencido: todos respondem `400` com a mesma
  mensagem. As tentativas contam no limite do ADR 0004, numa chave própria
  (`redefinicao:<e-mail>`), então errar o código não bloqueia o login.
- **Gancho para e-mail:** a geração e a validação do código não sabem por onde ele é
  entregue. A interface `EnvioDeCodigo` e o caso de uso `solicitarRedefinicaoPorEmail`
  já existem e têm teste com um canal falso; sem canal configurado, o caso de uso recusa
  em vez de fingir que enviou. Falta, quando houver domínio: implementar `EnvioDeCodigo`
  com um provedor, confirmar o e-mail no cadastro, limitar os pedidos e só então abrir
  uma rota pública `POST /senha/esqueci`.

Na mesma etapa, e pelo mesmo motivo (a conta precisa ser do aluno):

- `POST /conta/senha`: qualquer conta troca a própria senha, confirmando a atual; as
  outras sessões caem e a atual fica.
- `DELETE /conta`: o aluno exclui a própria conta, confirmando a senha. Conta, sessões e
  código somem; o nome vira "Aluno removido"; as aulas futuras são canceladas e o horário
  volta a ficar livre; as passadas ficam como histórico do instrutor, sem o nome. O saldo
  restante não é devolvido pelo sistema: pagamento é com o instrutor.
- `GET /minhas-aulas`: o aluno vê as próprias aulas e o saldo.

## Consequências

- Bom: recuperação funcionando sem provedor, custo, domínio nem segredo.
- Bom: o instrutor repassa o código, mas não vê nem define a senha.
- Bom: o dia em que houver e-mail, só o canal muda; a validação é a mesma.
- Ruim: depende do instrutor estar disponível, que é o que o sistema quer evitar. Aceitável
  por ser raro (esquecer a senha), não o fluxo principal.
- Ruim: o código circula pelo WhatsApp em texto. Mitigado por servir uma vez e vencer em
  1 hora.
- Ruim: há código (o caso de uso e a interface do e-mail) sem rota que o use. Foi pedido
  como gancho; os testes impedem que ele apodreça.
- Ruim: a exclusão anonimiza em vez de apagar o aluno, porque as aulas passadas apontam
  para ele. Conferir com quem entende de LGPD se o histórico pode ficar assim.

## Por que as outras alternativas foram descartadas

- **E-mail agora:** depende de domínio, provedor e confirmação de e-mail; empurraria a
  etapa para depois do deploy. Fica como evolução, com o gancho pronto.
- **Senha provisória definida pelo instrutor:** o instrutor conheceria a senha, mesmo que
  por pouco tempo, e o aluno tenderia a não trocá-la.
- **Sem recuperação:** quem esquecesse a senha dependeria de alguém mexer no banco à mão.
