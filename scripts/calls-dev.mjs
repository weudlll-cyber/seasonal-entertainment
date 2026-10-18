// ============================================================
// File:        calls-dev.mjs
// Path:        scripts/calls-dev.mjs
// Project:     Seasonal Entertainment
// Description: `npm run dev:calls`: the call service for local development and the browser
//              tests — the pinned LiveKit server (calls-binary.mjs) in --dev mode on
//              ws://127.0.0.1:7880 with LiveKit's development key pair (devkey / secret),
//              which the site accepts outside production only. CALLS_DEV_PORT moves it (the
//              browser tests use 7890): signalling there, ICE over TCP and UDP on the next two
//              ports. Stopping this stops LiveKit.
// ============================================================

import { spawn } from 'node:child_process';
import { ensureLiveKitBinary } from './calls-binary.mjs';

const port = Number(process.env.CALLS_DEV_PORT ?? 7880);
const ports = `port: ${port}\nrtc:\n  tcp_port: ${port + 1}\n  udp_port: ${port + 2}\n`;

const binary = await ensureLiveKitBinary();
// --bind: only this machine reaches the development server.
const livekit = spawn(binary, ['--dev', '--bind', '127.0.0.1', '--config-body', ports], {
  stdio: 'inherit',
});
console.log(
  `[calls] LiveKit dev server pid ${livekit.pid} on ws://127.0.0.1:${port} (devkey / secret)`
);

livekit.on('exit', (code) => process.exit(code ?? 0));
const stop = () => livekit.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
