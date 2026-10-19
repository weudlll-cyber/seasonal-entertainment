// ============================================================
// File:        vite.config.js
// Path:        client/vite.config.js
// Project:     Seasonal Entertainment
// Description: Vite build, dev server and Vitest configuration for the React client.
//              Ports and the API origin are read from the environment when Vite starts.
// ============================================================

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 5380 keeps clear of the race game's 5173/4173; the API server listens on 3800.
const devPort = Number(process.env.CLIENT_PORT ?? 5380);
const apiOrigin = process.env.API_ORIGIN ?? 'http://127.0.0.1:3800';

export default defineConfig({
  plugins: [react()],
  build: {
    // The cryptography chunk (libsodium with its WebAssembly, about 540 kB; the password-hashing
    // worker carries its own copy) is loaded only when a password or a private key is used
    // (session/credentials.js); every other chunk stays well below this.
    chunkSizeWarningLimit: 600,
  },
  // The password-hashing worker (session/passwordHashing.worker.js) as an ES module, the same
  // form the dev server serves it in; every browser the site supports runs module workers.
  worker: { format: 'es' },
  // Pre-bundled when the dev server starts: found only later (at the first password form),
  // the dev server would reload the page to add it, and the form with it.
  optimizeDeps: { include: ['libsodium-wrappers-sumo'] },
  server: {
    port: devPort,
    strictPort: true,
    // The browser calls /api and /ws on its own origin; in dev Vite forwards them. The
    // browser's Host header is passed on unchanged (changeOrigin: false; the string shorthand
    // would rewrite it to the API port), so the server's CSRF and WebSocket origin checks see
    // the same origin the browser sends, exactly as without a proxy.
    proxy: {
      '/api': { target: apiOrigin, changeOrigin: false },
      // Chat stickers, GIFs and preview images.
      '/media': { target: apiOrigin, changeOrigin: false },
      // The chat WebSocket, forwarded as a WebSocket.
      '/ws': { target: apiOrigin, changeOrigin: false, ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    // Well above findBy*'s 15 s wait (test/setup.js), so a slow screen fails as a missing
    // element with a clear message, not as a test that ran out of time; generous because the
    // machine may be heavily loaded.
    testTimeout: 45_000,
    include: ['src/**/*.test.{js,jsx}'],
  },
});
