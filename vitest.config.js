import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { versionDefines } from './scripts/versioning.mjs'

export default defineConfig({
  // Same build-time version constants as vite.config.js.
  define: versionDefines(dirname(fileURLToPath(import.meta.url))),

  test: {
    // Enable globals for describe, it, expect, etc.
    globals: true,

    // Use jsdom environment for DOM manipulation needed by the game
    environment: 'jsdom',

    // Include test files
    include: ['tests/unit/**/*.test.js', 'tests/unit/**/*.spec.js', 'tests/integration/**/*.test.js', 'tests/integration/**/*.spec.js'],

    // Setup files to run before tests
    setupFiles: ['./tests/setup.js'],

    // Timeout for integration tests that run the game loop
    testTimeout: 30000,

    // Use forks pool for isolation (Vitest 4 uses top-level options)
    pool: 'forks',

    // Run tests sequentially to avoid state conflicts
    sequence: {
      shuffle: false
    },

    // Coverage configuration (optional)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.js'],
      exclude: [
        'src/rendering/**',
        'src/ui/**',
        'src/sound.js',
        // Exclude data-only files that only export objects/constants
        'src/missions/mission_*.js',
        'src/data/**'
      ]
    }
  },

  // Resolve configuration to match Vite
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})
