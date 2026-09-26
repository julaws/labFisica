import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: 'default',
  },
});
