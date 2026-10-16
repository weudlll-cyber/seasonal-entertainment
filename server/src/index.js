// ============================================================
// File:        index.js
// Path:        server/src/index.js
// Project:     Seasonal Entertainment
// Description: Server entry point: reads configuration, builds the app and starts listening.
// ============================================================

import { createApp } from './app.js';
import { readBuildInfo } from './buildInfo.js';
import { readConfig } from './config.js';

const config = readConfig();
const buildInfo = readBuildInfo();
const app = createApp({ buildInfo, clientDist: config.clientDist });

app.listen(config.port, config.host, () => {
  console.log(
    `Seasonal Entertainment ${buildInfo.version} (${buildInfo.commit}) listening on http://${config.host}:${config.port}`
  );
});
