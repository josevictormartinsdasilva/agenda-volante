import { PrismaClient } from '@prisma/client';
import { afterAll } from 'vitest';
import { criarRepositoriosPrisma } from '../../src/infra/prisma/repositorios-prisma.js';
import { contratoDeRepositorios } from './contrato-de-repositorios.js';

/**
 * Precisa de um Postgres com as migrations aplicadas (`npx prisma migrate deploy`).
 * Sem TEST_DATABASE_URL o contrato é pulado; o CI sobe o banco e define a variável.
 */
const url = process.env.TEST_DATABASE_URL;
const db = url ? new PrismaClient({ datasourceUrl: url }) : undefined;

afterAll(() => db?.$disconnect());

contratoDeRepositorios(
  'Prisma/Postgres',
  async () => {
    if (!db) throw new Error('TEST_DATABASE_URL não definida');
    await db.$executeRawUnsafe('TRUNCATE "Aula", "Pacote", "Aluno", "Disponibilidade" CASCADE');
    return criarRepositoriosPrisma(db);
  },
  { pular: !db },
);
