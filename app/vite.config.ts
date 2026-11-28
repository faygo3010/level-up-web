import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      // connect-google.html: where Google sign-in for the AI connector lands before going on to the connector.
      input: { main: 'index.html', connectGoogle: 'connect-google.html' },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/web/**'],
      exclude: ['src/web/main.tsx', '**/__tests__/**'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 75 },
    },
  },
})
