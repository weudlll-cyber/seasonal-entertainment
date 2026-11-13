// ============================================================
// File:        store.js
// Path:        server/src/push/store.js
// Project:     Seasonal Entertainment
// Description: Data access for web push subscriptions (push/schema.js): save one for a member's
//              device (the same endpoint again moves to whoever saves it now: one browser, one
//              account at a time; at most MAX_PER_ACCOUNT, a new one beyond replaces the one
//              used least recently), remove one, remove all of an account's (when it is locked;
//              deletion cascades), its device's check (marks it used), a delivery (marks it
//              used), and the ones to send to: unlocked accounts, made for the site's current
//              public key.
// ============================================================

const now = () => new Date().toISOString();

// Devices per account (decided 2026-11-13): enough for every real member, and a bound on what
// one account makes the site send at each call start.
export const MAX_PER_ACCOUNT = 10;

// sub: the browser's PushSubscription as JSON ({ endpoint, keys: { p256dh, auth } }).
export function saveSubscription(db, userId, sub, vapidKey) {
  db.transaction(() => {
    const at = now();
    db.prepare(
      `INSERT INTO push_subscriptions
         (user_id, endpoint, p256dh, auth, vapid_key, created_at, used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh,
         auth = excluded.auth, vapid_key = excluded.vapid_key, created_at = excluded.created_at,
         used_at = excluded.used_at`
    ).run(userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, vapidKey, at, at);
    // Beyond the cap the least recently used go; the one just saved is the newest.
    db.prepare(
      `DELETE FROM push_subscriptions WHERE user_id = ? AND id NOT IN (
         SELECT id FROM push_subscriptions WHERE user_id = ?
         ORDER BY endpoint = ? DESC, used_at DESC, id DESC LIMIT ?)`
    ).run(userId, userId, sub.endpoint, MAX_PER_ACCOUNT);
  })();
}

// Only the member's own: another account's endpoint is left alone.
export function removeSubscription(db, userId, endpoint) {
  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(
    userId,
    endpoint
  );
}

export function removeUserSubscriptions(db, userId) {
  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(userId);
}

// The push service said the subscription is gone (404/410).
export function dropEndpoint(db, endpoint) {
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}

// Whether this member's device (its endpoint) has a subscription for the current key; the
// device asking marks it used.
export const checkSubscription = (db, userId, endpoint, vapidKey) =>
  db
    .prepare(
      `UPDATE push_subscriptions SET used_at = ?
       WHERE user_id = ? AND endpoint = ? AND vapid_key = ?`
    )
    .run(now(), userId, endpoint, vapidKey).changes === 1;

// The push service took a message for it.
export function markDelivered(db, endpoint) {
  db.prepare('UPDATE push_subscriptions SET used_at = ? WHERE endpoint = ?').run(now(), endpoint);
}

// Every subscription to send to now, as web-push wants them. Ones made for another key go
// first (they could never be delivered); a locked account's are skipped (setLocked removes
// them, this is the second guard).
export function subscriptionsToSend(db, vapidKey) {
  db.prepare('DELETE FROM push_subscriptions WHERE vapid_key != ?').run(vapidKey);
  return db
    .prepare(
      `SELECT s.endpoint, s.p256dh, s.auth FROM push_subscriptions s
       JOIN users u ON u.id = s.user_id
       WHERE u.locked = 0`
    )
    .all()
    .map((row) => ({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }));
}
