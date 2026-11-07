-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "StatusAula" AS ENUM ('reservada', 'cancelada');

-- CreateTable
CREATE TABLE "Aluno" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "Aluno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pacote" (
    "alunoId" TEXT NOT NULL,
    "saldo" INTEGER NOT NULL,

    CONSTRAINT "Pacote_pkey" PRIMARY KEY ("alunoId")
);

-- CreateTable
CREATE TABLE "Disponibilidade" (
    "inicio" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Disponibilidade_pkey" PRIMARY KEY ("inicio")
);

-- CreateTable
CREATE TABLE "Aula" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fim" TIMESTAMPTZ(3) NOT NULL,
    "status" "StatusAula" NOT NULL,

    CONSTRAINT "Aula_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Aula_inicio_idx" ON "Aula"("inicio");

-- AddForeignKey
ALTER TABLE "Pacote" ADD CONSTRAINT "Pacote_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aula" ADD CONSTRAINT "Aula_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- R3: um aluno por horário. Índice único parcial (o Prisma não o expressa no schema):
-- só aulas reservadas disputam o horário, então cancelar libera o início para outra reserva.
CREATE UNIQUE INDEX "Aula_inicio_reservada_key" ON "Aula"("inicio") WHERE "status" = 'reservada';
