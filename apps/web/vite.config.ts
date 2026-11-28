import { defineConfig } from 'vitest/config';

// React JSX is compiled by esbuild (tsconfig "jsx": "react-jsx"), so no plugin is needed.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', sourcemap: false },
  preview: { port: 4173, strictPort: true },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
