import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    // MuPDF's WASM takes a moment to load the first time.
    testTimeout: 20_000,
  },
});
