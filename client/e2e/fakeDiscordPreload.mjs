// ============================================================
// File:        fakeDiscordPreload.mjs
// Path:        client/e2e/fakeDiscordPreload.mjs
// Project:     Seasonal Entertainment
// Description: Loaded with `node --import` into the browser tests' Discord server
//              (playwright.config.js, on DISCORD_SERVER_PORT): that server's calls to Discord's
//              API go to the server tests' pretend Discord (server/test/helpers/fakeDiscord.js)
//              instead of discord.com, and Discord's authorize page is a small one on
//              FAKE_DISCORD_PORT that approves at once, as the member clicking "Authorize" would.
//              The browser is sent there by the spec (discordConfirm.spec.js, a route on the
//              site's Discord start). Test runs only; the server itself is the real one.
// ============================================================

import { createServer } from 'node:http';
import { URL } from 'node:url';
import { fakeDiscord } from '../../server/test/helpers/fakeDiscord.js';
import { FAKE_DISCORD_PORT, FAKE_DISCORD_USER } from './ports.js';

const fake = fakeDiscord();
// On the Seasonal Tokens server, with no roles: a plain member.
fake.addUser(FAKE_DISCORD_USER.id, FAKE_DISCORD_USER.username, []);

const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) =>
  String(url).startsWith('https://discord.com/api/')
    ? fake.fetch(String(url), init)
    : realFetch(url, init);

// GET /oauth2/authorize?…: straight back to the site's callback with a code, as an approval.
createServer((req, res) => {
  const asked = new URL(req.url, `http://127.0.0.1:${FAKE_DISCORD_PORT}`);
  const redirect = asked.searchParams.get('redirect_uri');
  if (asked.pathname !== '/oauth2/authorize' || !redirect) {
    res.writeHead(404).end();
    return;
  }
  const back = fake.approve(asked.href, FAKE_DISCORD_USER.id);
  res.writeHead(302, { location: new URL(back, redirect).href }).end();
}).listen(FAKE_DISCORD_PORT, '127.0.0.1');
