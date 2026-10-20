// ============================================================
// File:        ports.js
// Path:        client/e2e/ports.js
// Project:     Seasonal Entertainment
// Description: Ports of the browser-test run, shared by playwright.config.js and the specs:
//              the real server (built client, production shape) and a Vite dev server in
//              front of it, so the development proxy path is tested too; the run's own call
//              server (LiveKit in development mode, clear of a developer's on 7880).
// ============================================================

export const SERVER_PORT = 3810;
// SE_E2E_DEV_PROXY_PORT moves it when another project's dev server already holds 5390.
export const DEV_PROXY_PORT = Number(process.env.SE_E2E_DEV_PROXY_PORT) || 5390;
// Vite listens on "localhost" only, as in development; the browser opens it by that name.
export const DEV_PROXY_URL = `http://localhost:${DEV_PROXY_PORT}`;
// LiveKit: signalling on this port, ICE over TCP and UDP on the next two.
export const CALLS_PORT = 7890;
export const CALLS_URL = `ws://127.0.0.1:${CALLS_PORT}`;
