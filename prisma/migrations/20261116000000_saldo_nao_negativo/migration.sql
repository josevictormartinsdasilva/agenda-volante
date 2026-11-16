-- R5: o saldo do pacote nunca fica negativo. A aplicação já debita com `WHERE saldo >= 1`;
-- esta restrição é a última barreira, caso algum caminho novo esqueça a condição.
-- (O Prisma não expressa CHECK no schema, por isso fica só na migration.)
ALTER TABLE "Pacote" ADD CONSTRAINT "Pacote_saldo_nao_negativo" CHECK ("saldo" >= 0);
