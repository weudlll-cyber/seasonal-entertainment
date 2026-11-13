// ============================================================
// File:        serviceWorkerPlugin.js
// Path:        client/serviceWorkerPlugin.js
// Project:     Seasonal Entertainment
// Description: The site's service worker as served at /sw.js (docs/CALLS.md, "Push when a call
//              starts"): src/app/sw.js with the shared rule for a path on this site
//              (shared/localPath.js) put in front of it, so its notification click checks the
//              target by the same rule as the login's ?next= (decided 2026-11-13). The dev
//              server answers /sw.js with it; a build writes it to dist/sw.js. Text, not a
//              bundle: a classic service worker has no imports, and a module service worker
//              does not run in every browser the site supports.
// ============================================================

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientDir = path.dirname(fileURLToPath(import.meta.url));
const read = (...parts) => readFileSync(path.join(clientDir, ...parts), 'utf8');

// The shared module without its `export`: its functions become the worker's own.
export const serviceWorkerSource = () =>
  `${read('..', 'shared', 'localPath.js').replace(/^export /gm, '')}\n${read('src', 'app', 'sw.js')}`;

export function serviceWorkerPlugin() {
  return {
    name: 'se-service-worker',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/sw.js') return next();
        res.setHeader('Content-Type', 'text/javascript');
        res.end(serviceWorkerSource());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource() });
    },
  };
}
