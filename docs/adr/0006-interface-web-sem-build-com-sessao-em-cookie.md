# 0006. Interface do aluno em HTML e JS sem build, servida pela API, com sessão em cookie

- Status: aceito
- Data: 2026-11-17

## Contexto e problema

Até a versão 0.5.0 o aluno só conseguia usar o sistema por `curl`. Para o instrutor parar de
agendar pelo celular, o aluno precisa de uma tela no próprio celular: entrar, ver horários,
marcar, cancelar, ver as próprias aulas e cuidar da conta.

Decisões de produto, tomadas por mim: a interface fica **no mesmo repositório, servida pela
própria API**, e é feita em **HTML e JavaScript sem framework**. Restavam três decisões
técnicas: como servir os arquivos, onde guardar a sessão no navegador e como manter o
JavaScript confiável sem uma etapa de build.

## Fatores de decisão

- Poucas telas (seis): o tamanho da solução tem de acompanhar.
- Um script malicioso que chegue à página não pode levar o login do aluno.
- Nada de dependência ou etapa de build que eu não consiga explicar.
- O CI precisa pegar erro no JavaScript da interface, não só no TypeScript da API.

## Alternativas consideradas

Para a sessão no navegador:

1. **Cookie `HttpOnly` e `SameSite=Strict` gravado pelo login** (escolhida).
2. **Token do corpo do login guardado em `localStorage`** e mandado no `Authorization`.

Para servir os arquivos: **`@fastify/static`** (escolhido) ou uma rota própria que lê arquivos.

Para conferir o JavaScript: **JSDoc + `checkJs` no `tsc`** (escolhido), TypeScript com etapa
de build, ou nenhuma checagem.

## Decisão

- **Arquivos:** `web/` (HTML, CSS, três módulos JS e um favicon) é servida pelo
  `@fastify/static` com `wildcard: false`: na subida, ele registra uma rota por arquivo que
  existe. Não há rota coringa, então `..` ou qualquer arquivo fora da pasta dá `404`.
  Toda resposta da pasta leva uma CSP que só aceita script, estilo e conexão do próprio
  site (sem script inline), além de `nosniff`, `no-referrer` e `frame-ancestors 'none'`.
- **Sessão:** `POST /sessoes` continua devolvendo o token no corpo (clientes de API) e passa
  a gravá-lo também no cookie `sessao`, com `HttpOnly`, `SameSite=Strict`, `Path=/`,
  `Max-Age` igual à validade da sessão e `Secure`. A guarda lê o `Authorization: Bearer`
  quando ele vem; senão, o cookie. Logout e exclusão de conta apagam o cookie.
  - `HttpOnly`: o JavaScript da página não lê o token. Conferido no navegador:
    `document.cookie`, `localStorage` e `sessionStorage` ficam vazios.
  - `SameSite=Strict`: o navegador não manda o cookie em pedidos vindos de outro site, o
    que barra CSRF sem token anti-CSRF.
  - `Secure` (só HTTPS) é o padrão. `COOKIE_SEGURO=false` desliga para usar em http local,
    e o Compose desliga por isso; em produção, com HTTPS, fica ligado.
  - O cookie é lido e escrito à mão (poucas linhas em `src/routes/autorizacao.ts`), sem o
    `@fastify/cookie`: é um cookie só.
- **Telas:** uma página com as telas trocadas pelo endereço (`#/entrar`, `#/inicio`,
  `#/marcar`, `#/conta`...). Texto da API ou do usuário entra sempre como texto
  (`append`, `textContent`), nunca como HTML. A tela descobre se há aluno logado chamando
  `GET /minhas-aulas`: `401` leva ao login; instrutor e administrador recebem `403` e um
  aviso de que a interface deles ainda não existe.
- **Datas:** a API fala em UTC; só a interface converte para Fortaleza, com `Intl`.
- **Qualidade sem build:** os módulos de `web/js` têm anotações JSDoc e entram no `tsc`
  (`allowJs` e `checkJs`); o ESLint os confere com as globais do navegador. As partes
  puras (datas e cliente da API) têm testes no Vitest. O fluxo completo foi exercitado
  num Chrome sem janela (13 passos, no tamanho de um celular, temas claro e escuro), sem
  erro de JavaScript, de CSP ou no console. Esse roteiro ainda não está no repositório.

## Consequências

- Bom: o aluno marca e cancela pelo celular, sem instalar nada.
- Bom: um script injetado não consegue copiar o login para usar em outro lugar.
- Bom: sem framework, sem build, sem CORS e um deploy só.
- Ruim: o token aparece uma vez no corpo do login, que o JavaScript recebe. A interface
  não o guarda; um script injetado naquele instante o veria. Uma opção futura é o login
  pelo navegador não devolver o token no corpo.
- Ruim: com `COOKIE_SEGURO=false` (Compose), o cookie trafega sem HTTPS. É só para
  desenvolvimento; o README avisa.
- Ruim: o roteamento e o desenho das telas (`app.js`) não têm teste automatizado no CI,
  só a checagem de tipos e o roteiro no navegador feito à mão. Um teste de ponta a ponta
  (Playwright) no CI fica como próximo passo.
- Ruim: o prazo de cancelamento (48 h) é regra da API e a tela não o conhece; ela avisa de
  forma genérica e mostra o resultado (`creditoDevolvido`) depois.

## Por que as outras alternativas foram descartadas

- **Token em `localStorage`:** mais simples e igual ao que `curl` faz, mas qualquer script
  que rode na página lê o token e o leva embora. Com a interface no mesmo endereço da
  API, o cookie `HttpOnly` sai de graça.
- **Rota própria para os arquivos:** teria de tratar tipo de conteúdo, cache e `..` no
  caminho; o plugin oficial já faz isso e foi testado com a versão do Fastify do projeto.
- **TypeScript com build na interface:** mais uma etapa para explicar e manter; o `checkJs`
  dá a mesma segurança de tipos sem build.
