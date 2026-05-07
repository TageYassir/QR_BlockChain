import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4001',
      '/storage': 'http://127.0.0.1:4001'
    }
  }
});