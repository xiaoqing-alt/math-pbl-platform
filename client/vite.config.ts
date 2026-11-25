import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // KaTeX 单独打包成懒加载 chunk，减少首屏 JS 体积
        manualChunks(id) {
          if (id.includes('katex')) return 'katex';
          if (id.includes('react-dom') || id.includes('react/')) return 'react';
        },
      },
    },
  },
});
