// ============================================================
// File:        send.js
// Path:        server/src/push/send.js
// Project:     Seasonal Entertainment
// Description: Sends the one web push the site has (docs/CALLS.md, "Push when a call starts";
//              decided 2026-11-10): "<call title> has started" to every subscribed device of an
//              unlocked member, a click opening the call's page. The web-push library (MPL-2.0)
//              signs (VAPID) and encrypts each message (generateRequestDetails); Node's fetch
//              delivers it. A subscription the push service answers 404 or 410 for is gone and
//              is dropped. Never throws: a failed delivery is logged and the call is unaffected.
// ============================================================

import webpush from 'web-push';
import { dropEndpoint, subscriptionsToSend } from './store.js';

// Answers that mean the subscription no longer exists (expired, or the member revoked it).
const GONE = new Set([404, 410]);

// push: config.push (push/config.js). Returns { callStarted(call) }, which resolves to the
// number of deliveries once every device was tried.
export function pushSender(db, push, log = console.error) {
  async function deliver(subscription, payload) {
    const request = webpush.generateRequestDetails(subscription, payload, {
      vapidDetails: {
        subject: push.subject,
        publicKey: push.publicKey,
        privateKey: push.privateKey,
      },
      TTL: push.ttlSeconds,
      urgency: 'high',
    });
    const answer = await fetch(request.endpoint, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(push.timeoutMs),
    });
    if (GONE.has(answer.status)) dropEndpoint(db, subscription.endpoint);
    return answer.ok;
  }

  return {
    async callStarted(call) {
      const payload = JSON.stringify({
        body: `${call.title} has started`,
        url: `/calls/${call.id}`,
        tag: `call-started-${call.id}`,
      });
      let delivered = 0;
      for (const result of await Promise.allSettled(
        subscriptionsToSend(db, push.publicKey).map((sub) => deliver(sub, payload))
      )) {
        if (result.status === 'fulfilled' && result.value) delivered += 1;
        // The endpoint's address is the device's identity: logged only as the reason.
        else if (result.status === 'rejected') log(`[push] a delivery failed: ${result.reason}`);
      }
      return delivered;
    },
  };
}
