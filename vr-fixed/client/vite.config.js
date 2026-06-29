import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,   // exposes on network so phone can access it
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', rewrite: p => p.replace(/^\/api/, '') }
    }
  }
});
