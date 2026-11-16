import { describe, expect, it } from 'vitest';
import {
  CredenciaisInvalidas,
  EmailJaCadastrado,
  MuitasTentativas,
  NaoAutenticado,
} from '../../src/domain/erros.js';
import { criarAmbiente } from '../helpers.js';

const ANA = { nome: 'Ana', email: 'ana@exemplo.com', senha: 'senha-da-ana' };
const INSTRUTOR = { email: 'instrutor@exemplo.com', senha: 'senha-do-instrutor' };

describe('cadastrarAluno', () => {
  it('cria o aluno e a conta dele, sem devolver nem guardar a senha', async () => {
    const { autenticacao, repositorios } = criarAmbiente();

    const aluno = await autenticacao.cadastrarAluno(ANA);

    expect(aluno).toEqual({ id: 'id-1', nome: 'Ana', email: 'ana@exemplo.com' });
    expect(await repositorios.alunos.buscarPorId('id-1')).toEqual({ id: 'id-1', nome: 'Ana' });
    const conta = await repositorios.usuarios.buscarPorEmail('ana@exemplo.com');
    expect(conta).toMatchObject({ papel: 'aluno', alunoId: 'id-1' });
    expect(conta?.senhaHash).not.toBe(ANA.senha);
  });

  it('guarda o e-mail em minúsculas e sem espaços nas pontas', async () => {
    const { autenticacao } = criarAmbiente();

    const aluno = await autenticacao.cadastrarAluno({ ...ANA, email: '  Ana@Exemplo.COM ' });

    expect(aluno.email).toBe('ana@exemplo.com');
  });

  it('recusa e-mail que já tem conta (mesmo com outra caixa) e não deixa aluno órfão', async () => {
    const { autenticacao, repositorios } = criarAmbiente();
    await autenticacao.cadastrarAluno(ANA);

    await expect(
      autenticacao.cadastrarAluno({ nome: 'Outra Ana', email: 'ANA@exemplo.com', senha: 'outra-senha' }),
    ).rejects.toBeInstanceOf(EmailJaCadastrado);

    expect(await repositorios.alunos.listar()).toEqual([{ id: 'id-1', nome: 'Ana' }]);
  });
});

describe('criarAdmin e cadastrarInstrutor', () => {
  const ADMIN = { email: 'admin@exemplo.com', senha: 'senha-do-admin' };

  it('cria a conta do administrador, que entra com o papel admin', async () => {
    const { autenticacao } = criarAmbiente();

    const admin = await autenticacao.criarAdmin({ ...ADMIN, email: ' Admin@Exemplo.com ' });

    expect(admin).toEqual({ id: 'id-1', email: 'admin@exemplo.com' });
    await expect(autenticacao.entrar(ADMIN)).resolves.toMatchObject({ papel: 'admin', alunoId: null });
  });

  it('cadastra o instrutor, que entra com o papel instrutor', async () => {
    const { autenticacao, repositorios } = criarAmbiente();

    const instrutor = await autenticacao.cadastrarInstrutor(INSTRUTOR);

    expect(instrutor).toEqual({ id: 'id-1', email: 'instrutor@exemplo.com' });
    expect(await repositorios.usuarios.listarPorPapel('instrutor')).toHaveLength(1);
    await expect(autenticacao.entrar(INSTRUTOR)).resolves.toMatchObject({
      papel: 'instrutor',
      alunoId: null,
    });
  });

  it('recusa e-mail que já tem conta, seja qual for o papel, sem trocar a senha', async () => {
    const { autenticacao } = criarAmbiente();
    await autenticacao.cadastrarInstrutor(INSTRUTOR);

    await expect(
      autenticacao.criarAdmin({ email: INSTRUTOR.email, senha: 'outra-senha' }),
    ).rejects.toBeInstanceOf(EmailJaCadastrado);
    await expect(
      autenticacao.cadastrarInstrutor({ email: INSTRUTOR.email, senha: 'outra-senha' }),
    ).rejects.toBeInstanceOf(EmailJaCadastrado);

    await expect(autenticacao.entrar(INSTRUTOR)).resolves.toMatchObject({ papel: 'instrutor' });
  });
});

describe('entrar', () => {
  it('com a senha certa abre uma sessão que expira depois da duração configurada', async () => {
    const { autenticacao } = criarAmbiente(new Date('2026-11-10T12:00:00.000Z'));
    const aluno = await autenticacao.cadastrarAluno(ANA);

    const sessao = await autenticacao.entrar({ email: 'ANA@exemplo.com', senha: ANA.senha });

    expect(sessao.token.length).toBeGreaterThanOrEqual(32);
    expect(sessao).toMatchObject({
      papel: 'aluno',
      alunoId: aluno.id,
      expiraEm: new Date('2026-11-11T12:00:00.000Z'), // 24 h no ambiente de teste
    });
  });

  it('cada login gera um token diferente, e o armazenamento guarda só o resumo dele', async () => {
    const { autenticacao, repositorios } = criarAmbiente();
    await autenticacao.cadastrarAluno(ANA);

    const primeira = await autenticacao.entrar(ANA);
    const segunda = await autenticacao.entrar(ANA);

    expect(primeira.token).not.toBe(segunda.token);
    expect(await repositorios.sessoes.buscar(primeira.token)).toBeUndefined();
  });

  it('recusa senha errada e e-mail desconhecido com o mesmo erro', async () => {
    const { autenticacao } = criarAmbiente();
    await autenticacao.cadastrarAluno(ANA);

    const senhaErrada = autenticacao.entrar({ email: ANA.email, senha: 'chute' });
    const emailDesconhecido = autenticacao.entrar({ email: 'ninguem@exemplo.com', senha: ANA.senha });

    await expect(senhaErrada).rejects.toBeInstanceOf(CredenciaisInvalidas);
    await expect(emailDesconhecido).rejects.toBeInstanceOf(CredenciaisInvalidas);
  });
});

describe('limite de tentativas de login', () => {
  // No ambiente de teste: 5 tentativas por e-mail e 20 por origem, em 15 minutos.
  const errar = (ambiente: ReturnType<typeof criarAmbiente>, email: string, origem?: string) =>
    ambiente.autenticacao.entrar({ email, senha: 'chute', origem }).catch((erro: unknown) => erro);

  it('depois de 5 erros no mesmo e-mail, recusa até a senha certa, dizendo quanto esperar', async () => {
    const ambiente = criarAmbiente();
    await ambiente.autenticacao.cadastrarAluno(ANA);
    for (let i = 0; i < 5; i++) {
      expect(await errar(ambiente, ANA.email)).toBeInstanceOf(CredenciaisInvalidas);
    }

    const bloqueado = await ambiente.autenticacao.entrar(ANA).catch((erro: unknown) => erro);

    expect(bloqueado).toBeInstanceOf(MuitasTentativas);
    expect((bloqueado as MuitasTentativas).segundos).toBe(15 * 60);
  });

  it('o bloqueio é por e-mail sem diferenciar a caixa, e acaba depois da janela', async () => {
    const ambiente = criarAmbiente(new Date('2026-11-10T12:00:00.000Z'));
    await ambiente.autenticacao.cadastrarAluno(ANA);
    for (let i = 0; i < 5; i++) await errar(ambiente, i % 2 ? 'ANA@exemplo.com' : ANA.email);

    expect(await errar(ambiente, ANA.email)).toBeInstanceOf(MuitasTentativas);

    ambiente.relogio.agora = new Date('2026-11-10T12:15:00.000Z');
    await expect(ambiente.autenticacao.entrar(ANA)).resolves.toMatchObject({ papel: 'aluno' });
  });

  it('e-mail sem conta também é limitado, para não revelar quais e-mails existem', async () => {
    const ambiente = criarAmbiente();
    for (let i = 0; i < 5; i++) await errar(ambiente, 'ninguem@exemplo.com');

    expect(await errar(ambiente, 'ninguem@exemplo.com')).toBeInstanceOf(MuitasTentativas);
  });

  it('login certo zera os erros do e-mail', async () => {
    const ambiente = criarAmbiente();
    await ambiente.autenticacao.cadastrarAluno(ANA);
    for (let i = 0; i < 4; i++) await errar(ambiente, ANA.email);

    await ambiente.autenticacao.entrar(ANA);
    for (let i = 0; i < 4; i++) await errar(ambiente, ANA.email);

    await expect(ambiente.autenticacao.entrar(ANA)).resolves.toMatchObject({ papel: 'aluno' });
  });

  it('a mesma origem errando em vários e-mails é bloqueada depois de 20 tentativas', async () => {
    const ambiente = criarAmbiente();
    for (let i = 0; i < 20; i++) await errar(ambiente, `alvo${i}@exemplo.com`, '203.0.113.7');

    expect(await errar(ambiente, 'outro@exemplo.com', '203.0.113.7')).toBeInstanceOf(MuitasTentativas);
    expect(await errar(ambiente, 'outro@exemplo.com', '198.51.100.1')).toBeInstanceOf(
      CredenciaisInvalidas,
    );
  });

  it('logins certos não gastam o limite da origem (vários alunos na mesma rede)', async () => {
    const ambiente = criarAmbiente();
    await ambiente.autenticacao.cadastrarAluno(ANA);

    for (let i = 0; i < 25; i++) {
      await ambiente.autenticacao.entrar({ ...ANA, origem: '203.0.113.7' });
    }

    await expect(
      ambiente.autenticacao.entrar({ ...ANA, origem: '203.0.113.7' }),
    ).resolves.toMatchObject({ papel: 'aluno' });
  });

  it('tentativas simultâneas contam todas: não passam juntas antes do primeiro erro', async () => {
    const ambiente = criarAmbiente();
    await ambiente.autenticacao.cadastrarAluno(ANA);

    const resultados = await Promise.all(
      Array.from({ length: 12 }, () => errar(ambiente, ANA.email)),
    );

    expect(resultados.filter((r) => r instanceof CredenciaisInvalidas)).toHaveLength(5);
    expect(resultados.filter((r) => r instanceof MuitasTentativas)).toHaveLength(7);
  });
});

describe('limparSessoesExpiradas', () => {
  it('apaga só as sessões vencidas e diz quantas foram', async () => {
    const ambiente = criarAmbiente(new Date('2026-11-10T12:00:00.000Z'));
    await ambiente.autenticacao.cadastrarAluno(ANA);
    const antiga = await ambiente.autenticacao.entrar(ANA);
    ambiente.relogio.agora = new Date('2026-11-10T20:00:00.000Z');
    const nova = await ambiente.autenticacao.entrar(ANA);

    ambiente.relogio.agora = new Date('2026-11-11T12:00:00.000Z'); // a antiga venceu agora
    const removidas = await ambiente.autenticacao.limparSessoesExpiradas();

    expect(removidas).toBe(1);
    await expect(ambiente.autenticacao.identificar(nova.token)).resolves.toMatchObject({
      papel: 'aluno',
    });
    await expect(ambiente.autenticacao.identificar(antiga.token)).rejects.toBeInstanceOf(
      NaoAutenticado,
    );
  });
});

describe('identificar e sair', () => {
  it('reconhece o dono do token', async () => {
    const { autenticacao } = criarAmbiente();
    const aluno = await autenticacao.cadastrarAluno(ANA);
    const { token } = await autenticacao.entrar(ANA);

    const identidade = await autenticacao.identificar(token);

    expect(identidade).toMatchObject({ papel: 'aluno', alunoId: aluno.id });
    expect(identidade.usuarioId).toBeTruthy();
  });

  it('recusa token desconhecido', async () => {
    const { autenticacao } = criarAmbiente();

    await expect(autenticacao.identificar('token-inventado')).rejects.toBeInstanceOf(NaoAutenticado);
  });

  it('recusa a sessão a partir do instante em que expira, e a apaga', async () => {
    const ambiente = criarAmbiente(new Date('2026-11-10T12:00:00.000Z'));
    await ambiente.autenticacao.cadastrarAluno(ANA);
    const { token } = await ambiente.autenticacao.entrar(ANA);

    ambiente.relogio.agora = new Date('2026-11-11T11:59:59.999Z');
    await expect(ambiente.autenticacao.identificar(token)).resolves.toMatchObject({ papel: 'aluno' });

    ambiente.relogio.agora = new Date('2026-11-11T12:00:00.000Z');
    await expect(ambiente.autenticacao.identificar(token)).rejects.toBeInstanceOf(NaoAutenticado);

    // Mesmo voltando o relógio, a sessão expirada já foi removida.
    ambiente.relogio.agora = new Date('2026-11-10T12:00:00.000Z');
    await expect(ambiente.autenticacao.identificar(token)).rejects.toBeInstanceOf(NaoAutenticado);
  });

  it('sair encerra só aquela sessão', async () => {
    const { autenticacao } = criarAmbiente();
    await autenticacao.cadastrarAluno(ANA);
    const celular = await autenticacao.entrar(ANA);
    const computador = await autenticacao.entrar(ANA);

    await autenticacao.sair(celular.token);

    await expect(autenticacao.identificar(celular.token)).rejects.toBeInstanceOf(NaoAutenticado);
    await expect(autenticacao.identificar(computador.token)).resolves.toMatchObject({ papel: 'aluno' });
  });
});
