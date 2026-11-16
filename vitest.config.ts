import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Pontos de entrada: só montam as peças e ligam no processo (porta, terminal).
      // O que eles montam é testado separadamente.
      exclude: ['src/server.ts', 'src/criar-admin.ts'],
      // Mínimo declarado: o pipeline falha se a cobertura cair abaixo disso.
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
