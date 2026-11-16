import { criarCasosDeUso } from '../src/application/casos-de-uso.js';
import { CancelamentoComAntecedencia } from '../src/domain/politica-cancelamento.js';
import { criarRepositoriosEmMemoria } from '../src/infra/memoria/repositorios-em-memoria.js';

/** Monta os casos de uso com repositórios em memória, relógio controlável e ids previsíveis. */
export function criarAmbiente(agoraInicial = new Date('2026-11-10T12:00:00.000Z')) {
  const relogio = { agora: agoraInicial };
  let sequencia = 0;
  const repositorios = criarRepositoriosEmMemoria();
  const casos = criarCasosDeUso({
    repositorios,
    duracaoAulaMinutos: 50,
    politica: new CancelamentoComAntecedencia(48),
    agora: () => relogio.agora,
    gerarId: () => `id-${++sequencia}`,
  });
  return { casos, repositorios, relogio };
}
