import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Build opcional em arquivo único (SPEC §4). Todos os assets são embutidos,
// então o HDRI e as texturas externas precisam caber no orçamento de tamanho.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    outDir: 'dist-single',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    sourcemap: false,
  },
});
