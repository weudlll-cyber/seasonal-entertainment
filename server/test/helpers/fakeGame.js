// ============================================================
// File:        fakeGame.js
// Path:        server/test/helpers/fakeGame.js
// Project:     Seasonal Entertainment
// Description: A small stand-in game that answers the member-summary contract (docs/GAME-
//              INTEGRATION.md, "A member's results on their profile"; games/memberSummary.js)
//              on a real local port, for the tests and, beside the dev servers, for a look at
//              the profile cards. It checks the sync token as a game must, answers each user id
//              from `answers` (a body, or { status, body, raw, delayMs }), and "no such player"
//              (404) for the rest. It counts the requests, so a test can see the cache work.
// ============================================================

import { createServer } from 'node:http';

// answers: { [userId]: body | { status, body, raw, delayMs } }; slug: the game asked for.
// Resolves to { origin, answers, requests, close() }: answers may be changed after the start
// (a test learns its user ids later); requests: [{ path, user, token }].
export function startFakeGame({ slug, token, answers = {} }) {
  const requests = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://fake.game');
    const user = url.searchParams.get('user');
    requests.push({ path: url.pathname, user, token: req.headers['x-games-sync-token'] });
    const send = (status, text) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(text);
    };
    if (url.pathname !== `/games/${slug}/api/website/member-summary`) return send(404, '{}');
    if (req.headers['x-games-sync-token'] !== token) return send(401, '{}');
    const answer = answers[user];
    if (answer === undefined) return send(404, '{}');
    const {
      status = 200,
      body = answer,
      raw,
      delayMs = 0,
    } = answer && typeof answer === 'object' && 'status' in answer ? answer : { body: answer };
    setTimeout(() => send(status, raw ?? JSON.stringify(body)), delayMs);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        origin: `http://127.0.0.1:${server.address().port}`,
        answers,
        requests,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections();
            server.close(done);
          }),
      });
    });
  });
}
