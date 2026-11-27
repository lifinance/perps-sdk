import { defineConfig } from 'vitest/config'
import { workspaceSrcAliases } from '../../vitest.shared.js'

export default defineConfig({
  resolve: {
    alias: workspaceSrcAliases(import.meta.dirname),
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/*.handlers.ts', '**/*.mock.ts'],
    },
  },
})
