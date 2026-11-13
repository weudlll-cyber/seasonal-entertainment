// ============================================================
// File:        routes.js
// Path:        server/src/push/routes.js
// Project:     Seasonal Entertainment
// Description: /api/push, a member's web push switch for this device (docs/CALLS.md, "Push
//              when a call starts"; decided 2026-11-10). Members only; guests never. While push
//              is off (no VAPID keys, push/config.js) GET says so and the rest answers 404.
//              - GET /: { publicKey } (null: off; the account page then shows no switch).
//              - POST /status { endpoint }: whether this account has this device's
//                subscription (the switch's state; a body, so the endpoint is in no log line).
//              - POST /subscriptions { endpoint, keys: { p256dh, auth } }: turn on.
//              - DELETE /subscriptions { endpoint }: turn off.
//              The two writes and the status count against one limit per account.
// ============================================================

import express from 'express';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { validBody } from '../http/validate.js';
import { hasSubscription, removeSubscription, saveSubscription } from './store.js';

const MAX_ENDPOINT = 1024;
const MAX_KEY = 256;

// An endpoint on one of the push services (config.push.endpointHosts), over https.
function endpointError(push) {
  return (value) => {
    let url;
    try {
      url = typeof value === 'string' && value.length <= MAX_ENDPOINT ? new URL(value) : null;
    } catch {
      url = null;
    }
    const scheme =
      url && (url.protocol === 'https:' || (push.allowHttp && url.protocol === 'http:'));
    const host = url?.hostname ?? '';
    const known = push.endpointHosts.some((h) => host === h || host.endsWith(`.${h}`));
    return scheme && known ? null : 'Not a push service this site sends to.';
  };
}

const keysError = (value) =>
  value &&
  typeof value === 'object' &&
  ['p256dh', 'auth'].every(
    (name) =>
      typeof value[name] === 'string' &&
      value[name].length <= MAX_KEY &&
      /^[A-Za-z0-9_-]+=*$/.test(value[name])
  )
    ? null
    : 'The subscription keys are missing.';

export function pushRoutes(db, config) {
  const router = express.Router();
  const push = config.push;
  const perUser = makeLimiter(config.rateLimits.pushSubscribe, {
    keyGenerator: (req) => `user:${req.user.id}`,
  });
  const on = (_req, res, next) =>
    push ? next() : sendError(res, 404, 'push_off', 'Push notifications are not set up here.');

  router.get('/', allow('member'), (_req, res) => {
    res.json({ ok: true, publicKey: push?.publicKey ?? null });
  });

  router.post('/status', allow('member'), on, perUser, (req, res) => {
    const input = validBody(req, res, { endpoint: endpointError(push) });
    if (!input) return;
    res.json({
      ok: true,
      subscribed: hasSubscription(db, req.user.id, input.endpoint, push.publicKey),
    });
  });

  router.post('/subscriptions', allow('member'), on, perUser, (req, res) => {
    const input = validBody(req, res, { endpoint: endpointError(push), keys: keysError });
    if (!input) return;
    saveSubscription(db, req.user.id, input, push.publicKey);
    res.status(201).json({ ok: true });
  });

  router.delete('/subscriptions', allow('member'), on, perUser, (req, res) => {
    const input = validBody(req, res, { endpoint: endpointError(push) });
    if (!input) return;
    removeSubscription(db, req.user.id, input.endpoint);
    res.json({ ok: true });
  });

  return router;
}
