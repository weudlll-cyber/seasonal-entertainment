// ============================================================
// File:        config.js
// Path:        server/src/config.js
// Project:     Seasonal Entertainment
// Description: Reads the runtime configuration from environment variables at start time.
//              The listen address is never baked into a build, so one build runs on any host.
// ============================================================

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Defaults suit local work; a VPS sets HOST/PORT in its environment.
export function readConfig(env = process.env) {
  const port = Number(env.PORT ?? 3800);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${env.PORT}"`);
  }
  return {
    host: env.HOST ?? '127.0.0.1',
    port,
    // Built client served in production; missing folder simply means "API only".
    clientDist: path.resolve(env.CLIENT_DIST ?? path.join(serverDir, '..', 'client', 'dist')),
  };
}
