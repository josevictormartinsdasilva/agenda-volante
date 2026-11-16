/**
 * Erros de regra de negócio. Cada regra violada tem a sua classe, para a camada
 * HTTP (dia 08/11) mapear para um status sem inspecionar texto de mensagem.
 */
export class ErroDeDominio extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
  }
}

/** R1: a aula não começa em hora cheia. */
export class HorarioForaDaGrade extends ErroDeDominio {
  constructor() {
    super('A aula deve começar em hora cheia (7h, 8h, 13h...)');
  }
}

/** R2: duração fora do que cabe na hora (1 a 60 minutos, inteiros). */
export class DuracaoInvalida extends ErroDeDominio {
  constructor(minutos: number) {
    super(`Duração de aula inválida: ${minutos} min (use um inteiro de 1 a 60)`);
  }
}

/** O horário já começou ou já passou: não se reserva aula no passado. */
export class HorarioNoPassado extends ErroDeDominio {
  constructor() {
    super('Não é possível reservar um horário que já começou ou já passou');
  }
}

/** R3: já existe uma aula reservada nesse horário. */
export class HorarioOcupado extends ErroDeDominio {
  constructor() {
    super('Esse horário já está reservado');
  }
}

/** R4: o instrutor não publicou esse horário. */
export class HorarioIndisponivel extends ErroDeDominio {
  constructor() {
    super('Esse horário não está na disponibilidade publicada pelo instrutor');
  }
}

/** R5: o pacote do aluno não tem créditos. */
export class SaldoInsuficiente extends ErroDeDominio {
  constructor() {
    super('Saldo de aulas insuficiente no pacote');
  }
}

export class AulaJaCancelada extends ErroDeDominio {
  constructor() {
    super('Essa aula já foi cancelada');
  }
}

/** A data pedida não é um dia válido no formato AAAA-MM-DD. */
export class DataInvalida extends ErroDeDominio {
  constructor(data: string) {
    super(`Data inválida: "${data}" (use AAAA-MM-DD)`);
  }
}

export class AlunoNaoEncontrado extends ErroDeDominio {
  constructor() {
    super('Aluno não encontrado');
  }
}

export class AulaNaoEncontrada extends ErroDeDominio {
  constructor() {
    super('Aula não encontrada');
  }
}
