import type { FastifyInstance } from 'fastify';
import type { CasosDeUso } from '../application/casos-de-uso.js';
import { AcessoNegado } from '../domain/erros.js';
import { type Guarda, identidadeDe } from './autorizacao.js';

const querySchema = {
  type: 'object',
  required: ['data'],
  properties: { data: { type: 'string' } },
} as const;

const idSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', minLength: 1 } },
} as const;

/**
 * Quem pode o quê: o instrutor administra (alunos, pacotes, disponibilidade, agenda);
 * o aluno consulta os horários e reserva e cancela só as próprias aulas.
 */
export function agendaRoutes(casos: CasosDeUso, guarda: Guarda) {
  const soInstrutor = { onRequest: guarda('instrutor') };
  const qualquerLogado = { onRequest: guarda('aluno', 'instrutor') };

  return async (app: FastifyInstance): Promise<void> => {
    app.get('/alunos', soInstrutor, async () => ({ alunos: await casos.listarAlunos() }));

    app.get('/minhas-aulas', { onRequest: guarda('aluno') }, async (req) => {
      const { alunoId } = identidadeDe(req);
      // A guarda garante o papel aluno, e toda conta de aluno aponta para um aluno.
      return casos.aulasDoAluno(alunoId as string);
    });

    app.post<{ Params: { id: string }; Body: { quantidade: number } }>(
      '/alunos/:id/pacote',
      {
        ...soInstrutor,
        schema: {
          params: idSchema,
          body: {
            type: 'object',
            required: ['quantidade'],
            properties: { quantidade: { type: 'integer', minimum: 1 } },
          },
        },
      },
      async (req) => casos.registrarPacote(req.params.id, req.body.quantidade),
    );

    app.post<{ Body: { inicios: string[] } }>(
      '/disponibilidades',
      {
        ...soInstrutor,
        schema: {
          body: {
            type: 'object',
            required: ['inicios'],
            properties: {
              inicios: {
                type: 'array',
                minItems: 1,
                items: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
      async (req, res) => {
        await casos.publicarDisponibilidade(req.body.inicios.map((i) => new Date(i)));
        return res.status(204).send();
      },
    );

    app.get<{ Querystring: { data: string } }>(
      '/horarios-livres',
      { ...qualquerLogado, schema: { querystring: querySchema } },
      async (req) => {
        const horarios = await casos.consultarHorariosLivres(req.query.data);
        return { data: req.query.data, horarios };
      },
    );

    app.post<{ Body: { alunoId?: string; inicio: string } }>(
      '/aulas',
      {
        ...qualquerLogado,
        schema: {
          body: {
            type: 'object',
            required: ['inicio'],
            properties: {
              alunoId: { type: 'string', minLength: 1 },
              inicio: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      async (req, res) => {
        const identidade = identidadeDe(req);
        const { inicio } = req.body;
        // O aluno reserva para si (o `alunoId` vem da sessão); o instrutor diz para quem.
        const alunoId = identidade.alunoId ?? req.body.alunoId;
        if (!alunoId) {
          return res.status(400).send({ erro: 'Informe o alunoId da reserva' });
        }
        if (req.body.alunoId && req.body.alunoId !== alunoId) throw new AcessoNegado();
        return res.status(201).send(await casos.reservarAula(alunoId, new Date(inicio)));
      },
    );

    app.get<{ Querystring: { data: string } }>(
      '/agenda',
      { ...soInstrutor, schema: { querystring: querySchema } },
      async (req) => {
        const aulas = await casos.consultarAgenda(req.query.data);
        return { data: req.query.data, aulas };
      },
    );

    app.post<{ Params: { id: string } }>(
      '/aulas/:id/cancelar',
      { ...qualquerLogado, schema: { params: idSchema } },
      async (req) => {
        const { alunoId } = identidadeDe(req);
        return casos.cancelarAula(req.params.id, alunoId ? { alunoId } : undefined);
      },
    );
  };
}
