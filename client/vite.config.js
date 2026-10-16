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
    // The browser calls /api on its own origin; in dev Vite forwards it to the server.
    proxy: { '/api': apiOrigin },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
  },
});
