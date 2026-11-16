// Smoke test do fluxo principal: consultar horários livres e reservar uma aula.
// Mede os dois SLOs de docs/slo.md (disponibilidade e p95 < 300 ms).
//
// Uso (API já no ar em http://localhost:3000):
//   docker run --rm -i -e BASE_URL=http://host.docker.internal:3000 \
//     grafana/k6 run - < k6/smoke.js
import http from 'k6/http';
import exec from 'k6/execution';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const ITERACOES = Number(__ENV.ITERACOES || 200);
// Administrador criado antes com `npm run admin:criar`. Sem padrão: é obrigatório.
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL;
const ADMIN_SENHA = __ENV.ADMIN_SENHA;
const MS_HORA = 3_600_000;
const MS_DIA = 24 * MS_HORA;
// A grade é em America/Fortaleza (UTC-3, sem horário de verão).
const OFFSET_FORTALEZA_MS = 3 * MS_HORA;

export const options = {
  scenarios: {
    fluxo: {
      executor: 'shared-iterations',
      vus: 5,
      iterations: ITERACOES,
      maxDuration: '2m',
    },
  },
  thresholds: {
    // SLO 2: p95 abaixo de 300 ms nas duas chamadas do escopo
    'http_req_duration{endpoint:horarios_livres}': ['p(95)<300'],
    'http_req_duration{endpoint:reservar}': ['p(95)<300'],
    // SLO 1: disponibilidade de 99% (aqui, toda resposta esperada é 2xx)
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
};

const json = { headers: { 'Content-Type': 'application/json' } };

/** Cabeçalhos JSON com o token de sessão. */
function comToken(token) {
  return { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } };
}

/** Faz login e devolve o token. O login usa scrypt (lento de propósito) e fica fora da medição. */
function entrar(email, senha) {
  const sessao = http.post(`${BASE_URL}/sessoes`, JSON.stringify({ email, senha }), json);
  if (sessao.status !== 201) throw new Error(`login de ${email} falhou: ${sessao.status}`);
  return sessao.json('token');
}

// Roda uma vez antes da carga: com o administrador, cria um instrutor; com ele, cria um
// aluno com conta e saldo e publica um horário por iteração. Os e-mails e o dia inicial
// são sorteados para que reexecuções contra o mesmo banco não colidam (e-mail único e R3).
export function setup() {
  if (!ADMIN_EMAIL || !ADMIN_SENHA) {
    throw new Error('defina ADMIN_EMAIL e ADMIN_SENHA (crie a conta com npm run admin:criar)');
  }
  const sufixo = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const senha = 'senha-de-teste-do-k6';

  const admin = comToken(entrar(ADMIN_EMAIL, ADMIN_SENHA));
  const emailDoInstrutor = `k6-instrutor-${sufixo}@exemplo.com`;
  const criado = http.post(
    `${BASE_URL}/instrutores`,
    JSON.stringify({ email: emailDoInstrutor, senha }),
    admin,
  );
  if (criado.status !== 201) throw new Error(`cadastro do instrutor falhou: ${criado.status}`);
  const instrutor = comToken(entrar(emailDoInstrutor, senha));

  const email = `k6-aluno-${sufixo}@exemplo.com`;
  const aluno = http.post(
    `${BASE_URL}/alunos`,
    JSON.stringify({ nome: 'Aluno k6', email, senha }),
    json,
  );
  if (aluno.status !== 201) throw new Error(`cadastro do aluno falhou: ${aluno.status}`);
  const alunoId = aluno.json('id');

  const pacote = http.post(
    `${BASE_URL}/alunos/${alunoId}/pacote`,
    JSON.stringify({ quantidade: ITERACOES }),
    instrutor,
  );
  if (pacote.status !== 200) throw new Error(`pacote falhou: ${pacote.status}`);

  const hoje = new Date();
  const meiaNoite = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  const inicioBase = meiaNoite + (7 + Math.floor(Math.random() * 3000)) * MS_DIA;

  const inicios = [];
  for (let i = 0; i < ITERACOES; i++) {
    inicios.push(new Date(inicioBase + i * MS_HORA).toISOString());
  }
  const disp = http.post(`${BASE_URL}/disponibilidades`, JSON.stringify({ inicios }), instrutor);
  if (disp.status !== 204) throw new Error(`disponibilidade falhou: ${disp.status}`);

  // Uma sessão do aluno, compartilhada pelos VUs: o que se mede é consultar e reservar.
  return { token: entrar(email, senha), inicioBase };
}

// Cada iteração usa um horário próprio (índice único no teste), então não há disputa
// entre VUs e todo 201 esperado é de fato esperado.
export default function (dados) {
  const indice = exec.scenario.iterationInTest;
  const inicio = new Date(dados.inicioBase + indice * MS_HORA);
  const dia = new Date(inicio.getTime() - OFFSET_FORTALEZA_MS).toISOString().slice(0, 10);

  const aluno = comToken(dados.token);

  const livres = http.get(`${BASE_URL}/horarios-livres?data=${dia}`, {
    ...aluno,
    tags: { endpoint: 'horarios_livres' },
  });
  check(livres, {
    'horarios-livres responde 200': (r) => r.status === 200,
    'horário do teste aparece como livre': (r) =>
      r.json('horarios').includes(inicio.toISOString()),
  });

  const reserva = http.post(
    `${BASE_URL}/aulas`,
    JSON.stringify({ inicio: inicio.toISOString() }),
    { ...aluno, tags: { endpoint: 'reservar' } },
  );
  check(reserva, {
    'reserva responde 201': (r) => r.status === 201,
    'aula reservada': (r) => r.json('aula.status') === 'reservada',
  });
}
