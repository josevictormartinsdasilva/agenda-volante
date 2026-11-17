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

/** O instrutor tentou retirar um horário que já começou ou já passou: ele é histórico. */
export class RetiradaNoPassado extends ErroDeDominio {
  constructor() {
    super('Não é possível retirar um horário que já começou ou já passou');
  }
}

/** Retirar o horário cancelaria a aula reservada nele, e o instrutor não confirmou. */
export class HorarioComAulaReservada extends ErroDeDominio {
  constructor() {
    super(
      'Há uma aula reservada nesse horário. Confirme para cancelá-la e devolver o crédito ao aluno',
    );
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

export class EmailJaCadastrado extends ErroDeDominio {
  constructor() {
    super('Já existe uma conta com esse e-mail');
  }
}

/** Mesma mensagem para e-mail desconhecido e senha errada: não revela quais e-mails existem. */
export class CredenciaisInvalidas extends ErroDeDominio {
  constructor() {
    super('E-mail ou senha inválidos');
  }
}

/** Tentativas de login demais em pouco tempo, para o e-mail ou para a origem (IP). */
export class MuitasTentativas extends ErroDeDominio {
  constructor(readonly segundos: number) {
    const minutos = Math.ceil(segundos / 60);
    super(
      `Muitas tentativas de login. Tente de novo em ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`,
    );
  }
}

/** Quem está logado errou a própria senha ao confirmar uma operação. */
export class SenhaIncorreta extends ErroDeDominio {
  constructor() {
    super('Senha incorreta');
  }
}

/** Código de redefinição errado, já usado, vencido ou de um e-mail sem conta. */
export class CodigoInvalido extends ErroDeDominio {
  constructor() {
    super('Código inválido ou expirado');
  }
}

/** O aluno existe, mas não tem conta de acesso (cadastrado antes das contas). */
export class ContaNaoEncontrada extends ErroDeDominio {
  constructor() {
    super('Esse aluno não tem conta de acesso');
  }
}

/** Sem token, token desconhecido ou sessão expirada. */
export class NaoAutenticado extends ErroDeDominio {
  constructor() {
    super('Faça login para continuar');
  }
}

/** Autenticado, mas sem permissão para a operação. */
export class AcessoNegado extends ErroDeDominio {
  constructor() {
    super('Você não tem permissão para esta operação');
  }
}
