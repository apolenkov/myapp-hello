// @ts-check
const tseslint = require('typescript-eslint')
const sonarjs = require('eslint-plugin-sonarjs')
const unicorn = require('eslint-plugin-unicorn').default
const importX = require('eslint-plugin-import-x')
const jsdoc = require('eslint-plugin-jsdoc')
const regexp = require('eslint-plugin-regexp')
const security = require('eslint-plugin-security')
const n = require('eslint-plugin-n')

module.exports = tseslint.config(
  // Base TypeScript strict
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: __dirname,
      },
    },
  },

  // SonarJS — cognitive complexity
  {
    plugins: { sonarjs },
    rules: {
      'sonarjs/cognitive-complexity': ['error', 15],
      'sonarjs/no-duplicate-string': ['error', { threshold: 3 }],
    },
  },

  // Unicorn — modern patterns
  {
    plugins: { unicorn },
    rules: {
      'unicorn/filename-case': ['error', { case: 'kebabCase' }],
      'unicorn/no-null': 'off',
      'unicorn/prevent-abbreviations': 'off',
    },
  },

  // Import order + no cycles
  {
    plugins: { 'import-x': importX },
    rules: {
      'import-x/no-cycle': 'error',
      'import-x/no-self-import': 'error',
    },
  },

  // JSDoc — public API documentation (ClassDeclaration off for NestJS decorated classes)
  {
    plugins: { jsdoc },
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: false,
            ClassDeclaration: false,
            ArrowFunctionExpression: false,
          },
        },
      ],
      'jsdoc/require-description': 'error',
    },
  },

  // Security
  {
    plugins: { security },
    rules: {
      'security/detect-non-literal-regexp': 'error',
      'security/detect-object-injection': 'warn',
    },
  },

  // RegExp
  {
    plugins: { regexp },
    rules: regexp.configs['flat/recommended'].rules,
  },

  // Node.js
  {
    plugins: { n },
    rules: {
      'n/no-process-exit': 'error',
      'n/prefer-global/buffer': ['error', 'never'],
    },
  },

  // File size limits
  {
    rules: {
      'max-lines': ['error', { max: 250, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 50, skipBlankLines: true }],
    },
  },

  // Additional TS rules
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'interface', format: ['PascalCase'] },
        { selector: 'typeAlias', format: ['PascalCase'] },
        { selector: 'enum', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['UPPER_CASE'] },
      ],
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
