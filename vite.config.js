import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // 独自ドメインのルートで配信する。タイムテーブルは /fes6/time-table/
  base: '/',
  server: {
    port: 5173,
    open: false
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        timetable: resolve(import.meta.dirname, 'fes6/time-table/index.html'),
      },
    },
  },
});
