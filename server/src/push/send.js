// ============================================================
// File:        send.js
// Path:        server/src/push/send.js
// Project:     Seasonal Entertainment
// Description: Sends the one web push the site has (docs/CALLS.md, "Push when a call starts";
//              decided 2026-11-10): "<call title> has started" to every subscribed device of an
//              unlocked member, a click opening the call's page. The web-push library (MPL-2.0)
//              signs (VAPID) and encrypts each message (generateRequestDetails); Node's fetch
//              delivers it, at most push.sendInFlight at once (decided 2026-11-13), all of it
//              after the start's own work. A delivered message marks its subscription used; one
//              the push service answers 404 or 410 for is gone and is dropped. Never throws: a
//              failed delivery is logged and the call is unaffected.
// ============================================================

import webpush from 'web-push';
import { dropEndpoint, markDelivered, subscriptionsToSend } from './store.js';

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
    if (answer.ok) markDelivered(db, subscription.endpoint);
    return answer.ok;
  }

  // A few workers take the next subscription each, so at most sendInFlight requests are open.
  async function deliverAll(subscriptions, payload) {
    let next = 0;
    let delivered = 0;
    const worker = async () => {
      while (next < subscriptions.length) {
        const subscription = subscriptions[next];
        next += 1;
        try {
          if (await deliver(subscription, payload)) delivered += 1;
        } catch (error) {
          // The endpoint's address is the device's identity: logged only as the reason.
          log(`[push] a delivery failed: ${error}`);
        }
      }
    };
    const workers = Math.min(push.sendInFlight, subscriptions.length);
    await Promise.all(Array.from({ length: workers }, worker));
    return delivered;
  }

  return {
    async callStarted(call) {
      // Not even the reading of the subscriptions runs inside the start's request.
      await new Promise((resolve) => setImmediate(resolve));
      const payload = JSON.stringify({
        body: `${call.title} has started`,
        url: `/calls/${call.id}`,
        tag: `call-started-${call.id}`,
      });
      try {
        return await deliverAll(subscriptionsToSend(db, push.publicKey), payload);
      } catch (error) {
        // Not awaited by anyone (app.js wentLive): a database gone meanwhile is only logged.
        log(`[push] sending failed: ${error}`);
        return 0;
      }
    },
  };
}
