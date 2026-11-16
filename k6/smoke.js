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

// Roda uma vez antes da carga: cria aluno com saldo e publica um horário por iteração.
// O dia inicial é sorteado para que reexecuções contra o mesmo banco não colidam (R3).
export function setup() {
  const aluno = http.post(`${BASE_URL}/alunos`, JSON.stringify({ nome: 'Aluno k6' }), json);
  if (aluno.status !== 201) throw new Error(`cadastro do aluno falhou: ${aluno.status}`);
  const alunoId = aluno.json('id');

  const pacote = http.post(
    `${BASE_URL}/alunos/${alunoId}/pacote`,
    JSON.stringify({ quantidade: ITERACOES }),
    json,
  );
  if (pacote.status !== 200) throw new Error(`pacote falhou: ${pacote.status}`);

  const hoje = new Date();
  const meiaNoite = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  const inicioBase = meiaNoite + (7 + Math.floor(Math.random() * 3000)) * MS_DIA;

  const inicios = [];
  for (let i = 0; i < ITERACOES; i++) {
    inicios.push(new Date(inicioBase + i * MS_HORA).toISOString());
  }
  const disp = http.post(`${BASE_URL}/disponibilidades`, JSON.stringify({ inicios }), json);
  if (disp.status !== 204) throw new Error(`disponibilidade falhou: ${disp.status}`);

  return { alunoId, inicioBase };
}

// Cada iteração usa um horário próprio (índice único no teste), então não há disputa
// entre VUs e todo 201 esperado é de fato esperado.
export default function (dados) {
  const indice = exec.scenario.iterationInTest;
  const inicio = new Date(dados.inicioBase + indice * MS_HORA);
  const dia = new Date(inicio.getTime() - OFFSET_FORTALEZA_MS).toISOString().slice(0, 10);

  const livres = http.get(`${BASE_URL}/horarios-livres?data=${dia}`, {
    tags: { endpoint: 'horarios_livres' },
  });
  check(livres, {
    'horarios-livres responde 200': (r) => r.status === 200,
    'horário do teste aparece como livre': (r) =>
      r.json('horarios').includes(inicio.toISOString()),
  });

  const reserva = http.post(
    `${BASE_URL}/aulas`,
    JSON.stringify({ alunoId: dados.alunoId, inicio: inicio.toISOString() }),
    { ...json, tags: { endpoint: 'reservar' } },
  );
  check(reserva, {
    'reserva responde 201': (r) => r.status === 201,
    'aula reservada': (r) => r.json('aula.status') === 'reservada',
  });
}
