import { defineConfig } from 'vite';

/** Node bundle for the terminal edition (`npm run build:terminal`). */
export default defineConfig({
  publicDir: false,
  logLevel: 'warn',
  build: {
    ssr: 'src/terminal/main.ts',
    outDir: 'dist-cli',
    emptyOutDir: true,
    target: 'node20',
  },
});
