import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts'],
      // Mínimo declarado: o pipeline falha se a cobertura cair abaixo disso.
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
