/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies are forbidden',
      from: {},
      to: { circular: true },
    },
    {
      name: 'database-no-feature-imports',
      severity: 'error',
      comment: 'Database module must not depend on feature modules',
      from: { path: '^src/database' },
      to: { path: '^src/(auth|metrics)' },
    },
    {
      name: 'no-test-in-production',
      severity: 'error',
      comment: 'Production code must not import test files',
      from: { path: '^src', pathNot: '__tests__' },
      to: { path: '__tests__' },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    exclude: {
      path: ['node_modules', 'dist'],
    },
  },
}
