// @ts-check
const { base, tseslint } = require('@myapp/eslint-config')

module.exports = tseslint.config(
  ...base,

  // Project-specific TypeScript parser config
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: __dirname,
      },
    },
  },

  // Test file overrides (NestJS testing APIs return untyped values)
  {
    files: ['src/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      'security/detect-object-injection': 'off',
    },
  },

  // Bootstrap file overrides
  {
    files: ['src/main.ts'],
    rules: {
      'n/no-process-exit': 'off',
    },
  },

  // Ignore patterns
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'vitest.config.ts', '*.cjs'],
  },
)
