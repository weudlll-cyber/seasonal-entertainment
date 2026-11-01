// ============================================================
// File:        accountDeleteData.test.js
// Path:        server/test/accountDeleteData.test.js
// Project:     Seasonal Entertainment
// Description: Guards what deleting an account removes at once (accounts/deletion.js, docs/AUTH.md
//              "Deleting an account"): the account, its sessions (also one half-way through the
//              2FA login), 2FA secret and recovery codes, keys, favourites (both ways), read
//              marks (its own and the partners' marks of its conversations), muted rooms,
//              mentions, its room messages with their files on disk,
//              every direct message and direct file it sent or received (the partner's copy
//              too), its chat reports and direct reports, sanctions, embed tokens, call
//              participation and reminders. And what stays: other members' messages and
//              conversations, the audit log, call recordings and their chapters.
// ============================================================

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { encryptFile } from '@seasonal-entertainment/shared/crypto.js';
import { recordAudit } from '../src/audit/auditLog.js';
import { issueToken } from '../src/embed/tokens.js';
import { sealSecret } from '../src/twofa/secretBox.js';
import { codeForStep, stepAt } from '../src/twofa/totp.js';
import { logIn, proof } from './helpers/accountKeys.js';
import { chatApp, post } from './helpers/chat.js';
import { sendDirect } from './helpers/direct.js';
import { PASSWORD, memberWithKey } from './helpers/keys.js';
import { STAFF_TOTP_SECRET } from './helpers/testApp.js';
import { gpsJpeg, sendFile, upload, uploadedFiles } from './helpers/uploads.js';

let t;
afterEach(() => t?.close());

const count = (sql, ...args) => t.db.prepare(`SELECT COUNT(*) AS n FROM ${sql}`).get(...args).n;
// Sessions signed in as the account, or half-way through its 2FA login.
const sessionsOf = (id) =>
  count(
    `sessions WHERE json_extract(sess, '$.userId') = ?
       OR json_extract(sess, '$.pendingLogin.userId') = ?`,
    id,
    id
  );
const directFiles = () => {
  const dir = path.join(t.config.mediaDir, 'direct');
  return existsSync(dir) ? readdirSync(dir) : [];
};

// anna (to be deleted), ben and carol, with everything an account can leave behind.
async function world() {
  t = chatApp();
  const anna = await memberWithKey(t, 'anna');
  const ben = await memberWithKey(t, 'ben');
  const carol = await memberWithKey(t, 'carol');
  const a = anna.user.id;

  // Room messages: anna mentions ben; ben mentions anna; anna sends a picture.
  const annaPost = (await post(anna.agent, 'general', 'hello @ben').expect(201)).body.message;
  const benPost = (await post(ben.agent, 'general', 'hi @anna').expect(201)).body.message;
  const up = await upload(anna.agent, await gpsJpeg());
  await sendFile(anna.agent, up.body.upload.id, 'a picture').expect(201);
  // Each reports the other's message.
  await anna.agent.post(`/api/chat/messages/${benPost.id}/report`).expect(200);
  await ben.agent.post(`/api/chat/messages/${annaPost.id}/report`).expect(200);
  // Read marks, a muted room, favourites both ways.
  await anna.agent.post('/api/chat/rooms/general/read').send({ lastId: benPost.id }).expect(200);
  await anna.agent.put('/api/chat/rooms/general/mute').expect(200);
  await anna.agent.put('/api/chat/favourites/rooms/general').expect(200);
  await anna.agent.put(`/api/chat/favourites/users/${ben.user.id}`).expect(200);
  await ben.agent.put(`/api/chat/favourites/users/${a}`).expect(200);

  // Direct messages both ways, a direct file from anna, and carol's own conversation with ben.
  const { data } = await encryptFile(new TextEncoder().encode('secret file'));
  const file = await anna.agent
    .post(`/api/chat/direct/${ben.user.id}/files`)
    .set('Content-Type', 'application/octet-stream')
    .send(Buffer.from(data))
    .expect(201);
  const fileId = file.body.file.id;
  await sendDirect(anna, ben.user, { text: 'to ben', file: { id: fileId } }, { fileId });
  const fromBen = (await sendDirect(ben, anna.user, { text: 'to anna' })).body.message;
  const fromCarol = (await sendDirect(carol, ben.user, { text: 'carol to ben' })).body.message;
  await ben.agent.post(`/api/chat/direct/${a}/read`).send({ lastId: fromBen.id }).expect(200);
  await ben.agent.post(`/api/chat/direct/${carol.user.id}/read`).send({ lastId: fromCarol.id });
  // ben reports anna's conversation.
  await ben.agent
    .post(`/api/chat/direct/${a}/report`)
    .send({ messageId: fromBen.id, reason: 'spam' })
    .expect(201);

  // A second signed-in session; with 2FA on (next), a third login stops half-way.
  expect((await logIn(t.client(), 'anna', PASSWORD)).status).toBe(200);
  // 2FA rows, a sanction, an embed token, a call with anna in it, a reminder and a recording.
  t.db
    .prepare("INSERT INTO two_factor (user_id, secret, enabled_at) VALUES (?, ?, 'now')")
    .run(a, await sealSecret(STAFF_TOTP_SECRET, t.config.secretKey));
  t.db.prepare("INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, 'h')").run(a);
  t.db
    .prepare(
      `INSERT INTO chat_sanctions (kind, user_id, target, created_by, created_at)
       VALUES ('mute', ?, 'anna', 'mona', 'now')`
    )
    .run(a);
  issueToken(t.db, { id: a, sessionEpoch: 0 }, 'https://game.example');
  t.db
    .prepare(
      `INSERT INTO calls (id, title, created_by, created_at, room_name)
       VALUES (1, 'Call', ?, 'now', 'room-1')`
    )
    .run(a);
  t.db
    .prepare("INSERT INTO call_participants (call_id, identity, user_id) VALUES (1, 'p-1', ?)")
    .run(a);
  t.db
    .prepare("INSERT INTO call_reminders (user_id, call_id, created_at) VALUES (?, 1, 'now')")
    .run(a);
  t.db
    .prepare(
      `INSERT INTO call_recordings (id, call_id, egress_id, file, started_at, started_by)
       VALUES (1, 1, 'eg-1', 'recordings/r1.mp4', 'now', 'anna')`
    )
    .run();
  t.db
    .prepare(
      `INSERT INTO call_recording_chapters (recording_id, at_seconds, title, created_by, created_at)
       VALUES (1, 5, 'Intro', 'anna', 'now')`
    )
    .run();
  const halfWay = await logIn(t.client(), 'anna', PASSWORD);
  expect(halfWay.body.twoFactorRequired).toBe(true);
  expect(sessionsOf(a)).toBe(3);
  // An audit entry anna wrote (as staff once).
  recordAudit(t.db, anna.user, { action: 'chat.hide', targetType: 'chat_message', targetId: 1 });

  return { anna, ben, carol, a };
}

// anna's own deletion: her password and, as her 2FA is on, a current code.
const deleteAnna = async (anna) =>
  anna.agent
    .delete('/api/auth/account')
    .send({ ...(await proof(PASSWORD)), code: codeForStep(STAFF_TOTP_SECRET, stepAt(Date.now())) })
    .expect(200);

describe('deleting an account', () => {
  it('removes every kind of data of the account at once', async () => {
    const { anna, a } = await world();
    expect(uploadedFiles(t.config).length).toBeGreaterThan(0);
    expect(directFiles()).toHaveLength(1);

    await deleteAnna(anna);

    const gone = {
      account: count('users WHERE id = ?', a),
      sessions: sessionsOf(a),
      twoFactor: count('two_factor WHERE user_id = ?', a),
      recoveryCodes: count('recovery_codes WHERE user_id = ?', a),
      keys: count('user_keys WHERE user_id = ?', a),
      sealedKeys: count('user_secret_keys WHERE user_id = ?', a),
      favouriteRooms: count('chat_favourite_rooms WHERE user_id = ?', a),
      favouriteUsers: count('chat_favourite_users WHERE user_id = ? OR favourite_id = ?', a, a),
      readMarks: count('chat_reads WHERE user_id = ?', a),
      partnersReadMarks: count("chat_reads WHERE scope = 'direct' AND target_id = ?", a),
      mutedRooms: count('chat_room_mutes WHERE user_id = ?', a),
      mentionsOfAnna: count('chat_mentions WHERE user_id = ?', a),
      roomMessages: count("chat_messages WHERE author_name = 'anna'"),
      uploads: count('chat_uploads'),
      roomReports: count('chat_reports'),
      directMessages: count('direct_messages WHERE sender_id = ? OR recipient_id = ?', a, a),
      directFiles: count('direct_files'),
      directReports: count('direct_reports'),
      sanctions: count('chat_sanctions'),
      embedTokens: count('embed_tokens'),
      callParticipants: count('call_participants'),
      callReminders: count('call_reminders'),
    };
    expect(gone).toEqual(Object.fromEntries(Object.keys(gone).map((k) => [k, 0])));
    // The files on disk too.
    expect(uploadedFiles(t.config)).toEqual([]);
    expect(directFiles()).toEqual([]);
  });

  it("keeps other members' messages and conversations, the audit log and call recordings", async () => {
    const { anna, ben, carol } = await world();
    const auditBefore = t.db.prepare('SELECT action, actor_name FROM audit_log').all();

    await deleteAnna(anna);

    // ben's message stays; only its mention of anna went.
    const general = (await ben.agent.get('/api/chat/rooms/general/messages')).body.messages;
    expect(general.map((m) => m.body)).toEqual(['hi @anna']);
    // carol's conversation with ben, and ben's read mark of it.
    expect(count('direct_messages WHERE sender_id = ?', carol.user.id)).toBe(1);
    expect(count("chat_reads WHERE scope = 'direct' AND target_id = ?", carol.user.id)).toBe(1);
    expect(count('users')).toBe(2);
    expect(count('user_keys WHERE user_id IN (?, ?)', ben.user.id, carol.user.id)).toBe(2);
    // The audit log as it was (the entry's actor link is cleared, its name stays).
    expect(t.db.prepare('SELECT action, actor_name FROM audit_log').all()).toEqual(auditBefore);
    expect(auditBefore).toContainEqual({ action: 'chat.hide', actor_name: 'anna' });
    // The recording, its chapter and its call stay (the call without its creator).
    expect(count('call_recordings')).toBe(1);
    expect(count('call_recording_chapters')).toBe(1);
    expect(t.db.prepare('SELECT created_by FROM calls').get()).toEqual({ created_by: null });
  });
});
