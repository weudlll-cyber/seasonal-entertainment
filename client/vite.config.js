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
    // Above findBy*'s 5 s wait (test/setup.js), so a slow screen fails as a missing element
    // with a clear message, not as a test that ran out of time.
    testTimeout: 15_000,
    include: ['src/**/*.test.{js,jsx}'],
  },
});
