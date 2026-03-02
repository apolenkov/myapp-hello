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
      to: { path: '^src/(auth|items|metrics)' },
    },
    {
      name: 'metrics-no-feature-imports',
      severity: 'error',
      comment: 'Metrics module must not depend on feature modules',
      from: { path: '^src/metrics' },
      to: { path: '^src/(auth|database|items)' },
    },
    {
      name: 'auth-no-feature-imports',
      severity: 'error',
      comment: 'Auth module must not depend on database or metrics',
      from: { path: '^src/auth' },
      to: { path: '^src/(database|items|metrics)' },
    },
    {
      name: 'config-no-feature-imports',
      severity: 'error',
      comment: 'Config module must not depend on feature modules',
      from: { path: '^src/config' },
      to: { path: '^src/(auth|database|items|metrics)' },
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
