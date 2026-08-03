import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // the backend listens on its own port, so /api requests are forwarded
      // there during development. the browser only ever talks to the vite
      // origin, which is why the api needs no CORS configuration of its own.
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
