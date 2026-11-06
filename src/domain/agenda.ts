import {
  AulaJaCancelada,
  HorarioForaDaGrade,
  HorarioIndisponivel,
  HorarioNoPassado,
  HorarioOcupado,
  SaldoInsuficiente,
} from './erros.js';
import { calcularFim, ehHoraCheia } from './horario.js';
import type { PoliticaDeCancelamento } from './politica-cancelamento.js';
import type { Aula, Pacote } from './tipos.js';

export interface PedidoDeReserva {
  id: string;
  alunoId: string;
  inicio: Date;
  /** Horários (início das aulas) que o instrutor publicou. */
  disponibilidade: readonly Date[];
  /** Aulas já existentes; as canceladas são ignoradas. */
  aulasReservadas: readonly Aula[];
  pacote: Pacote;
  /** Instante atual, injetado pelo chamador para o domínio continuar puro e testável. */
  agora: Date;
}

export interface RegrasDeReserva {
  duracaoAulaMinutos: number;
}

/**
 * Valida R1 a R5 (mais a recusa de horário passado) e devolve a aula criada e o pacote com 1 crédito a menos.
 * Função pura: não altera os argumentos e não faz I/O. Quem persiste é o caso
 * de uso (dia 08/11), que busca os dados via repositório e chama esta função.
 */
export function reservarAula(
  pedido: PedidoDeReserva,
  regras: RegrasDeReserva,
): { aula: Aula; pacote: Pacote } {
  const { inicio } = pedido;

  if (!ehHoraCheia(inicio)) throw new HorarioForaDaGrade(); // R1

  const fim = calcularFim(inicio, regras.duracaoAulaMinutos); // R2

  // Aula que começa agora ou antes já não pode ser reservada.
  if (inicio.getTime() <= pedido.agora.getTime()) throw new HorarioNoPassado();

  const publicado = pedido.disponibilidade.some((d) => d.getTime() === inicio.getTime());
  if (!publicado) throw new HorarioIndisponivel(); // R4

  const ocupado = pedido.aulasReservadas.some(
    (a) => a.status === 'reservada' && a.inicio.getTime() === inicio.getTime(),
  );
  if (ocupado) throw new HorarioOcupado(); // R3

  if (pedido.pacote.saldo < 1) throw new SaldoInsuficiente(); // R5

  return {
    aula: { id: pedido.id, alunoId: pedido.alunoId, inicio, fim, status: 'reservada' },
    pacote: { ...pedido.pacote, saldo: pedido.pacote.saldo - 1 },
  };
}

export interface PedidoDeCancelamento {
  aula: Aula;
  pacote: Pacote;
  agora: Date;
}

/** R6: cancela a aula; a política decide se o crédito volta ao pacote. */
export function cancelarAula(
  pedido: PedidoDeCancelamento,
  politica: PoliticaDeCancelamento,
): { aula: Aula; pacote: Pacote; creditoDevolvido: boolean } {
  if (pedido.aula.status === 'cancelada') throw new AulaJaCancelada();

  const creditoDevolvido = politica.devolveCredito(pedido.aula.inicio, pedido.agora);

  return {
    aula: { ...pedido.aula, status: 'cancelada' },
    pacote: creditoDevolvido
      ? { ...pedido.pacote, saldo: pedido.pacote.saldo + 1 }
      : pedido.pacote,
    creditoDevolvido,
  };
}
