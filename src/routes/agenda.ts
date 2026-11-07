import type { FastifyInstance } from 'fastify';
import type { CasosDeUso } from '../application/casos-de-uso.js';

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

export function agendaRoutes(casos: CasosDeUso) {
  return async (app: FastifyInstance): Promise<void> => {
    app.post<{ Body: { nome: string } }>(
      '/alunos',
      {
        schema: {
          body: {
            type: 'object',
            required: ['nome'],
            properties: { nome: { type: 'string', minLength: 1 } },
          },
        },
      },
      async (req, res) => res.status(201).send(await casos.cadastrarAluno(req.body)),
    );

    app.post<{ Params: { id: string }; Body: { quantidade: number } }>(
      '/alunos/:id/pacote',
      {
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
      { schema: { querystring: querySchema } },
      async (req) => {
        const horarios = await casos.consultarHorariosLivres(req.query.data);
        return { data: req.query.data, horarios };
      },
    );

    app.post<{ Body: { alunoId: string; inicio: string } }>(
      '/aulas',
      {
        schema: {
          body: {
            type: 'object',
            required: ['alunoId', 'inicio'],
            properties: {
              alunoId: { type: 'string', minLength: 1 },
              inicio: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      async (req, res) => {
        const { alunoId, inicio } = req.body;
        return res.status(201).send(await casos.reservarAula(alunoId, new Date(inicio)));
      },
    );

    app.get<{ Querystring: { data: string } }>(
      '/agenda',
      { schema: { querystring: querySchema } },
      async (req) => {
        const aulas = await casos.consultarAgenda(req.query.data);
        return { data: req.query.data, aulas };
      },
    );

    app.post<{ Params: { id: string } }>(
      '/aulas/:id/cancelar',
      { schema: { params: idSchema } },
      async (req) => casos.cancelarAula(req.params.id),
    );
  };
}
