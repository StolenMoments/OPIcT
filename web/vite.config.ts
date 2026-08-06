import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: { proxy: { '/api': process.env.VITE_API_PROXY ?? 'http://localhost:3000' } },
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts' },
});
