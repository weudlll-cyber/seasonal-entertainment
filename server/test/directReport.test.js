// ============================================================
// File:        directReport.test.js
// Path:        server/test/directReport.test.js
// Project:     Seasonal Entertainment
// Description: Guards reporting a direct message with consent: without sharing, no message
//              text reaches the server (only the reason and the fact); with sharing, exactly the
//              selected messages arrive, as copies, with author and time from the server; ids
//              from another conversation are refused (nothing stored); only moderators read
//              reports, every view of copies is audited, and so are the report and the review;
//              copies are deleted 90 days after the review.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { runChatRetention } from '../src/chat/retention.js';
import { auditActions } from './helpers/chat.js';
import { sendDirect } from './helpers/direct.js';
import { memberWithKey } from './helpers/keys.js';
import { makeStaff, makeTestApp } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

// anna and ben with three messages; carol and ben with one (another conversation).
async function conversations() {
  t = makeTestApp();
  const anna = await memberWithKey(t, 'anna');
  const ben = await memberWithKey(t, 'ben');
  const carol = await memberWithKey(t, 'carol');
  const ids = [];
  for (const [from, to, text] of [
    [ben, anna, 'one'],
    [anna, ben, 'two'],
    [ben, anna, 'three'],
    [carol, ben, 'elsewhere'],
  ]) {
    ids.push((await sendDirect(from, to.user, { text })).body.message.id);
  }
  return { anna, ben, ids };
}

const report = (agent, partnerId, body) =>
  agent.post(`/api/chat/direct/${partnerId}/report`).send(body);
const copiesTable = () => t.db.prepare('SELECT * FROM direct_report_copies').all();

describe('reporting', () => {
  it('without sharing: the reason and the fact, no message text', async () => {
    const { anna, ben, ids } = await conversations();
    const res = await report(anna.agent, ben.user.id, { messageId: ids[2], reason: 'rude' });
    expect(res.status).toBe(201);
    expect(copiesTable()).toEqual([]);
    const { agent: mod } = await makeStaff(t, 'mona', 'organiser');
    const listed = (await mod.get('/api/chat/direct-reports')).body.reports;
    expect(listed).toEqual([
      expect.objectContaining({ reporter: 'anna', partner: 'ben', reason: 'rude', shared: 0 }),
    ]);
  });

  it('with sharing: exactly the selected messages, author and time from the server', async () => {
    const { anna, ben, ids } = await conversations();
    const shared = [
      { id: ids[0], text: 'one' },
      { id: ids[2], text: 'three', mediaItemId: 4 },
    ];
    const res = await report(anna.agent, ben.user.id, {
      messageId: ids[2],
      reason: 'rude',
      shared,
    });
    expect(res.status).toBe(201);
    const { agent: mod } = await makeStaff(t, 'mona', 'organiser');
    const [{ id }] = (await mod.get('/api/chat/direct-reports')).body.reports;
    const { copies } = (await mod.get(`/api/chat/direct-reports/${id}/copies`)).body;
    expect(copies).toEqual([
      expect.objectContaining({ messageId: ids[0], author: 'ben', text: 'one', mediaItemId: null }),
      expect.objectContaining({ messageId: ids[2], author: 'ben', text: 'three', mediaItemId: 4 }),
    ]);
  });

  it('refuses ids from another conversation, and stores nothing', async () => {
    const { anna, ben, ids } = await conversations();
    const shared = [{ id: ids[3], text: 'elsewhere' }];
    const res = await report(anna.agent, ben.user.id, { messageId: ids[2], reason: 'x', shared });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('not_in_conversation');
    // Nor can the reported message itself be someone else's.
    expect((await report(anna.agent, ben.user.id, { messageId: ids[3], reason: 'x' })).status).toBe(
      404
    );
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM direct_reports').get().n).toBe(0);
    expect(copiesTable()).toEqual([]);
  });
});

describe('reading reports', () => {
  it('only moderators; every view of copies is audited, as are report and review', async () => {
    const { anna, ben, ids } = await conversations();
    await report(anna.agent, ben.user.id, {
      messageId: ids[2],
      reason: 'rude',
      shared: [{ id: ids[2], text: 'three' }],
    });
    for (const agent of [anna.agent, ben.agent]) {
      expect((await agent.get('/api/chat/direct-reports')).status).toBe(403);
      expect((await agent.get('/api/chat/direct-reports/1/copies')).status).toBe(403);
    }
    expect((await t.client().get('/api/chat/direct-reports')).status).toBe(401);

    const { agent: mod } = await makeStaff(t, 'mona', 'organiser');
    await mod.get('/api/chat/direct-reports/1/copies').expect(200);
    await mod.get('/api/chat/direct-reports/1/copies').expect(200);
    await mod.post('/api/chat/direct-reports/1/reviewed').expect(200);
    expect(auditActions(t)).toEqual([
      'chat.direct_report',
      'chat.direct_report_view',
      'chat.direct_report_view',
      'chat.direct_report_review',
    ]);
    // The audit log never holds the shared text.
    const audit = JSON.stringify(t.db.prepare('SELECT * FROM audit_log').all());
    expect(audit).not.toContain('three');
    expect((await mod.get('/api/chat/direct-reports')).body.reports).toEqual([]);
  });

  it('shared copies are deleted 90 days after the review', async () => {
    const { anna, ben, ids } = await conversations();
    const shared = [{ id: ids[2], text: 'three' }];
    await report(anna.agent, ben.user.id, { messageId: ids[2], reason: 'rude', shared });
    const { agent: mod } = await makeStaff(t, 'mona', 'organiser');
    await mod.post('/api/chat/direct-reports/1/reviewed').expect(200);
    const day = 24 * 60 * 60 * 1000;
    runChatRetention(t.db, t.config, Date.now() + 89 * day);
    expect(copiesTable()).toHaveLength(1);
    runChatRetention(t.db, t.config, Date.now() + 91 * day);
    expect(copiesTable()).toEqual([]);
  });
});
