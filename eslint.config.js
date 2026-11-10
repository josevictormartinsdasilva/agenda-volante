import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Scripts do k6 rodam no runtime do k6, não no Node: __ENV é global dele
    files: ['k6/**/*.js'],
    languageOptions: { globals: { ...globals.node, __ENV: 'readonly' } },
  },
);
