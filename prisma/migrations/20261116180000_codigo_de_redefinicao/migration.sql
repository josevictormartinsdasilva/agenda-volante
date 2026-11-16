-- CreateTable
CREATE TABLE "CodigoDeRedefinicao" (
    "usuarioId" TEXT NOT NULL,
    "codigoHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CodigoDeRedefinicao_pkey" PRIMARY KEY ("usuarioId")
);

-- CreateIndex
CREATE INDEX "Aula_alunoId_idx" ON "Aula"("alunoId");

-- AddForeignKey
ALTER TABLE "CodigoDeRedefinicao" ADD CONSTRAINT "CodigoDeRedefinicao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

