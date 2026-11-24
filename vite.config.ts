import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 48210,
    strictPort: true,
    open: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:48211',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    port: 48210,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:48211',
        changeOrigin: true,
      },
    },
  },
});
