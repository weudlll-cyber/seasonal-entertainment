// ============================================================
// File:        ports.js
// Path:        client/e2e/ports.js
// Project:     Seasonal Entertainment
// Description: Ports of the browser-test run, shared by playwright.config.js and the specs:
//              the real server (built client, production shape) and a Vite dev server in
//              front of it, so the development proxy path is tested too.
// ============================================================

export const SERVER_PORT = 3810;
export const DEV_PROXY_PORT = 5390;
// Vite listens on "localhost" only, as in development; the browser opens it by that name.
export const DEV_PROXY_URL = `http://localhost:${DEV_PROXY_PORT}`;
