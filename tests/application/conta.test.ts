import { describe, expect, it, vi } from 'vitest';
import {
  AcessoNegado,
  CodigoInvalido,
  ContaNaoEncontrada,
  MuitasTentativas,
  NaoAutenticado,
  SenhaIncorreta,
} from '../../src/domain/erros.js';
import { criarAluno, criarAmbiente, type Ambiente } from '../helpers.js';

const ANA = { nome: 'Ana', email: 'ana@exemplo.com', senha: 'senha-da-ana' };
const H10 = new Date('2026-11-20T13:00:00.000Z'); // futuro em relação ao "agora" de teste
const ONTEM = new Date('2026-11-09T13:00:00.000Z');

async function anaLogada(ambiente: Ambiente) {
  const aluno = await ambiente.autenticacao.cadastrarAluno(ANA);
  const sessao = await ambiente.autenticacao.entrar(ANA);
  const identidade = await ambiente.autenticacao.identificar(sessao.token);
  return { aluno, sessao, identidade };
}

describe('trocarSenha', () => {
  it('com a senha atual certa troca a senha e derruba as outras sessões, menos a atual', async () => {
    const ambiente = criarAmbiente();
    const { sessao, identidade } = await anaLogada(ambiente);
    const outroAparelho = await ambiente.autenticacao.entrar(ANA);

    await ambiente.autenticacao.trocarSenha({
      usuarioId: identidade.usuarioId,
      senhaAtual: ANA.senha,
      novaSenha: 'senha-nova-da-ana',
      tokenAtual: sessao.token,
    });

    await expect(ambiente.autenticacao.identificar(sessao.token)).resolves.toBeDefined();
    await expect(ambiente.autenticacao.identificar(outroAparelho.token)).rejects.toBeInstanceOf(
      NaoAutenticado,
    );
    await expect(ambiente.autenticacao.entrar(ANA)).rejects.toThrow();
    await expect(
      ambiente.autenticacao.entrar({ email: ANA.email, senha: 'senha-nova-da-ana' }),
    ).resolves.toMatchObject({ papel: 'aluno' });
  });

  it('com a senha atual errada recusa e não troca nada', async () => {
    const ambiente = criarAmbiente();
    const { identidade } = await anaLogada(ambiente);

    await expect(
      ambiente.autenticacao.trocarSenha({
        usuarioId: identidade.usuarioId,
        senhaAtual: 'chute',
        novaSenha: 'senha-nova-da-ana',
      }),
    ).rejects.toBeInstanceOf(SenhaIncorreta);

    await expect(ambiente.autenticacao.entrar(ANA)).resolves.toMatchObject({ papel: 'aluno' });
  });

  it('erros da senha atual contam no mesmo limite do login', async () => {
    const ambiente = criarAmbiente();
    const { identidade } = await anaLogada(ambiente);
    const trocar = () =>
      ambiente.autenticacao
        .trocarSenha({ usuarioId: identidade.usuarioId, senhaAtual: 'chute', novaSenha: 'x'.repeat(8) })
        .catch((erro: unknown) => erro);

    for (let i = 0; i < 5; i++) expect(await trocar()).toBeInstanceOf(SenhaIncorreta);

    expect(await trocar()).toBeInstanceOf(MuitasTentativas);
  });
});

describe('código de redefinição gerado pelo instrutor', () => {
  it('gera um código legível, de uso único, que vale 1 hora', async () => {
    const ambiente = criarAmbiente(new Date('2026-11-10T12:00:00.000Z'));
    const { aluno } = await anaLogada(ambiente);

    const { codigo, expiraEm } = await ambiente.autenticacao.gerarCodigoDeRedefinicao(aluno.id);

    expect(codigo).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    expect(expiraEm).toEqual(new Date('2026-11-10T13:00:00.000Z'));
  });

  it('o aluno usa o código para criar senha nova, e todas as sessões dele caem', async () => {
    const ambiente = criarAmbiente();
    const { aluno, sessao } = await anaLogada(ambiente);
    const { codigo } = await ambiente.autenticacao.gerarCodigoDeRedefinicao(aluno.id);

    await ambiente.autenticacao.redefinirSenha({
      email: ANA.email,
      codigo: codigo.toLowerCase().replace('-', ' '), // como alguém digitaria
      novaSenha: 'senha-nova-da-ana',
    });

    await expect(ambiente.autenticacao.identificar(sessao.token)).rejects.toBeInstanceOf(
      NaoAutenticado,
    );
    await expect(
      ambiente.autenticacao.entrar({ email: ANA.email, senha: 'senha-nova-da-ana' }),
    ).resolves.toMatchObject({ papel: 'aluno' });
  });

  it('o código só serve uma vez', async () => {
    const ambiente = criarAmbiente();
    const { aluno } = await anaLogada(ambiente);
    const { codigo } = await ambiente.autenticacao.gerarCodigoDeRedefinicao(aluno.id);
    const redefinir = () =>
      ambiente.autenticacao.redefinirSenha({ email: ANA.email, codigo, novaSenha: 'senha-nova-da-ana' });

    await redefinir();

    await expect(redefinir()).rejects.toBeInstanceOf(CodigoInvalido);
  });

  it('de dois usos simultâneos do mesmo código, só um passa', async () => {
    const ambiente = criarAmbiente();
    const { aluno } = await anaLogada(ambiente);
    const { codigo } = await ambiente.autenticacao.gerarCodigoDeRedefinicao(aluno.id);

    const resultados = await Promise.allSettled([
      ambiente.autenticacao.redefinirSenha({ email: ANA.email, codigo, novaSenha: 'primeira-senha' }),
      ambiente.autenticacao.redefinirSenha({ email: ANA.email, codigo, novaSenha: 'segunda-senha' }),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('recusa código vencido, código de outro aluno e código errado, sem trocar a senha', async () => {
    const ambiente = criarAmbiente(new Date('2026-11-10T12:00:00.000Z'));
    const { aluno } = await anaLogada(ambiente);
    const bia = await ambiente.autenticacao.cadastrarAluno({
      nome: 'Bia',
      email: 'bia@exemplo.com',
      senha: 'senha-da-bia',
    });
    const daAna = await ambiente.autenticacao.gerarCodigoDeRedefinicao(aluno.id);
    const daBia = await ambiente.autenticacao.gerarCodigoDeRedefinicao(bia.id);
    const redefinir = (codigo: string) =>
      ambiente.autenticacao
        .redefinirSenha({ email: ANA.email, codigo, novaSenha: 'senha-nova-da-ana' })
        .catch((erro: unknown) => erro);

    expect(await redefinir(daBia.codigo)).toBeInstanceOf(CodigoInvalido);
    expect(await redefinir('AAAA-AAAA')).toBeInstanceOf(CodigoInvalido);
    ambiente.relogio.agora = new Date('2026-11-10T13:00:00.000Z'); // venceu agora
    expect(await redefinir(daAna.codigo)).toBeInstanceOf(CodigoInvalido);

    await expect(ambiente.autenticacao.entrar(ANA)).resolves.toMatchObject({ papel: 'aluno' });
  });

  it('um código novo invalida o anterior', async () => {
    const ambiente = criarAmbiente();
    const { aluno } = await anaLogada(ambiente);
    const antigo = await ambiente.autenticacao.gerarCodigoDeRedefinicao(aluno.id);
    await ambiente.autenticacao.gerarCodigoDeRedefinicao(aluno.id);

    await expect(
      ambiente.autenticacao.redefinirSenha({
        email: ANA.email,
        codigo: antigo.codigo,
        novaSenha: 'senha-nova-da-ana',
      }),
    ).rejects.toBeInstanceOf(CodigoInvalido);
  });

  it('e-mail sem conta responde igual a código errado', async () => {
    const { autenticacao } = criarAmbiente();

    await expect(
      autenticacao.redefinirSenha({ email: 'ninguem@exemplo.com', codigo: 'AAAA-AAAA', novaSenha: 'x'.repeat(8) }),
    ).rejects.toBeInstanceOf(CodigoInvalido);
  });

  it('tentativas de código contam no limite: 5 erros por e-mail bloqueiam', async () => {
    const ambiente = criarAmbiente();
    await anaLogada(ambiente);
    const errar = () =>
      ambiente.autenticacao
        .redefinirSenha({ email: ANA.email, codigo: 'AAAA-AAAA', novaSenha: 'x'.repeat(8) })
        .catch((erro: unknown) => erro);

    for (let i = 0; i < 5; i++) expect(await errar()).toBeInstanceOf(CodigoInvalido);

    expect(await errar()).toBeInstanceOf(MuitasTentativas);
  });

  it('aluno sem conta de acesso: não há para quem gerar código', async () => {
    const ambiente = criarAmbiente();
    const semConta = await criarAluno(ambiente, 'Bia');

    await expect(ambiente.autenticacao.gerarCodigoDeRedefinicao(semConta.id)).rejects.toBeInstanceOf(
      ContaNaoEncontrada,
    );
  });
});

describe('gancho para a recuperação por e-mail (sem rota ainda)', () => {
  it('com um canal de envio configurado, manda o código ao dono do e-mail', async () => {
    const enviar = vi.fn(async () => {});
    const ambiente = criarAmbiente(new Date('2026-11-10T12:00:00.000Z'), { enviar });
    await anaLogada(ambiente);

    await ambiente.autenticacao.solicitarRedefinicaoPorEmail('ANA@exemplo.com');

    expect(enviar).toHaveBeenCalledWith({
      email: 'ana@exemplo.com',
      codigo: expect.stringMatching(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/),
      expiraEm: new Date('2026-11-10T13:00:00.000Z'),
    });
    const { codigo } = (enviar.mock.calls[0] as unknown as [{ codigo: string }])[0];
    await expect(
      ambiente.autenticacao.redefinirSenha({ email: ANA.email, codigo, novaSenha: 'senha-nova-da-ana' }),
    ).resolves.toBeUndefined();
  });

  it('e-mail sem conta não envia nada e não dá erro (não revela quem tem conta)', async () => {
    const enviar = vi.fn(async () => {});
    const { autenticacao } = criarAmbiente(undefined, { enviar });

    await expect(autenticacao.solicitarRedefinicaoPorEmail('ninguem@exemplo.com')).resolves.toBeUndefined();
    expect(enviar).not.toHaveBeenCalled();
  });

  it('sem canal de envio configurado, recusa em vez de fingir que enviou', async () => {
    const { autenticacao } = criarAmbiente();

    await expect(autenticacao.solicitarRedefinicaoPorEmail(ANA.email)).rejects.toThrow(
      /não configurad/,
    );
  });
});

describe('excluirConta (aluno)', () => {
  it('com a senha certa: apaga conta e sessões, anonimiza o nome e libera os horários futuros', async () => {
    const ambiente = criarAmbiente();
    const { aluno, sessao, identidade } = await anaLogada(ambiente);
    await ambiente.casos.registrarPacote(aluno.id, 2);
    await ambiente.casos.publicarDisponibilidade([H10]);
    const { aula: futura } = await ambiente.casos.reservarAula(aluno.id, H10);
    await ambiente.repositorios.aulas.salvar({
      id: 'aula-passada',
      alunoId: aluno.id,
      inicio: ONTEM,
      fim: new Date(ONTEM.getTime() + 50 * 60_000),
      status: 'reservada',
    });

    await ambiente.autenticacao.excluirConta({ usuarioId: identidade.usuarioId, senha: ANA.senha });

    expect(await ambiente.repositorios.usuarios.buscarPorEmail(ANA.email)).toBeUndefined();
    await expect(ambiente.autenticacao.identificar(sessao.token)).rejects.toBeInstanceOf(NaoAutenticado);
    expect(await ambiente.repositorios.alunos.buscarPorId(aluno.id)).toEqual({
      id: aluno.id,
      nome: 'Aluno removido',
    });
    expect((await ambiente.repositorios.aulas.buscarPorId(futura.id))?.status).toBe('cancelada');
    expect(await ambiente.casos.consultarHorariosLivres('2026-11-20')).toEqual([H10]);
    // O histórico do que já aconteceu fica com o instrutor, sem o nome.
    expect((await ambiente.repositorios.aulas.buscarPorId('aula-passada'))?.status).toBe('reservada');
  });

  it('o e-mail fica livre para uma conta nova', async () => {
    const ambiente = criarAmbiente();
    const { identidade } = await anaLogada(ambiente);

    await ambiente.autenticacao.excluirConta({ usuarioId: identidade.usuarioId, senha: ANA.senha });

    await expect(ambiente.autenticacao.cadastrarAluno(ANA)).resolves.toMatchObject({ email: ANA.email });
  });

  it('com a senha errada recusa e não apaga nada', async () => {
    const ambiente = criarAmbiente();
    const { identidade } = await anaLogada(ambiente);

    await expect(
      ambiente.autenticacao.excluirConta({ usuarioId: identidade.usuarioId, senha: 'chute' }),
    ).rejects.toBeInstanceOf(SenhaIncorreta);

    expect(await ambiente.repositorios.usuarios.buscarPorEmail(ANA.email)).toBeDefined();
  });

  it('instrutor e administrador não se excluem por aqui', async () => {
    const ambiente = criarAmbiente();
    const conta = await ambiente.autenticacao.cadastrarInstrutor({
      email: 'instrutor@exemplo.com',
      senha: 'senha-do-instrutor',
    });

    await expect(
      ambiente.autenticacao.excluirConta({ usuarioId: conta.id, senha: 'senha-do-instrutor' }),
    ).rejects.toBeInstanceOf(AcessoNegado);
  });
});

describe('aulasDoAluno (minhas aulas)', () => {
  it('lista as aulas do aluno em ordem, com status, e o saldo', async () => {
    const ambiente = criarAmbiente();
    const ana = await criarAluno(ambiente, 'Ana');
    const bia = await criarAluno(ambiente, 'Bia');
    const H11 = new Date('2026-11-20T14:00:00.000Z');
    const H12 = new Date('2026-11-20T15:00:00.000Z');
    await ambiente.casos.registrarPacote(ana.id, 3);
    await ambiente.casos.registrarPacote(bia.id, 1);
    await ambiente.casos.publicarDisponibilidade([H10, H11, H12]);
    const segunda = await ambiente.casos.reservarAula(ana.id, H11);
    const primeira = await ambiente.casos.reservarAula(ana.id, H10);
    await ambiente.casos.reservarAula(bia.id, H12);
    await ambiente.casos.cancelarAula(segunda.aula.id);

    const minhas = await ambiente.casos.aulasDoAluno(ana.id);

    expect(minhas.saldo).toBe(2); // 3 - 2 reservas + 1 devolvido no cancelamento
    expect(minhas.aulas.map((a) => [a.id, a.status])).toEqual([
      [primeira.aula.id, 'reservada'],
      [segunda.aula.id, 'cancelada'],
    ]);
  });

  it('aluno sem pacote nem aulas: saldo zero e lista vazia', async () => {
    const ambiente = criarAmbiente();
    const ana = await criarAluno(ambiente, 'Ana');

    expect(await ambiente.casos.aulasDoAluno(ana.id)).toEqual({ saldo: 0, aulas: [] });
  });
});
