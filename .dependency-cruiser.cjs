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
      name: 'utils-no-internal-imports',
      severity: 'error',
      from: { path: '^src/utils' },
      to: { path: '^src/(controllers|services|repositories|middleware)' },
    },
    {
      name: 'models-no-internal-imports',
      severity: 'error',
      from: { path: '^src/models' },
      to: { path: '^src/(controllers|services|repositories|middleware)' },
    },
    {
      name: 'repositories-no-services',
      severity: 'error',
      from: { path: '^src/repositories' },
      to: { path: '^src/services' },
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
