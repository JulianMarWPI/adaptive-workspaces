import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Everything is bundled; no CDN at runtime. The only network calls the app
// makes are to localhost (the local server, Ollama via the server, and the
// optional LSL bridge websocket).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@aw/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  server: {
    host: '127.0.0.1',
  },
  optimizeDeps: {
    exclude: ['@aw/core'],
  },
});
