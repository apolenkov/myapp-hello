import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      thresholds: {
        lines: 90,
        branches: 85,
        functions: 90,
        statements: 90,
      },
      exclude: [
        'src/main.ts',
        'src/instrumentation.ts',
        'src/db/migrate.ts',
        'src/__tests__/**',
        'src/**/*.module.ts',
        '**/*.d.ts',
        'dist/**',
      ],
    },
  },
  plugins: [swc.vite()],
})
