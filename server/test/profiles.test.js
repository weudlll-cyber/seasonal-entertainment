// ============================================================
// File:        profiles.test.js
// Path:        server/test/profiles.test.js
// Project:     Seasonal Entertainment
// Description: Guards the member profiles (profiles/, docs/AUTH.md "Member profiles"): members
//              only (a guest gets 401); what a profile shows (name, role, member since, About me,
//              picture addresses, steps, whether a direct message is possible, own); a locked
//              account's profile is not found, a deleted one's is gone with its picture files;
//              About me at most 300 characters (an emoji counts once), no control characters,
//              stored trimmed; the picture with the chat images' rules (images only, the size
//              and megapixel settings), served to members and never cached, replaced (the old
//              files go) and removed by the member; an admin clears About me and the picture,
//              each with one audit entry naming the account and not the text; members cannot.
// ============================================================

import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setSetting } from '../src/settings/store.js';
import { chatApp } from './helpers/chat.js';
import { largePng, makeImage } from './helpers/media.js';
import { PDF, uploadedFiles } from './helpers/uploads.js';
import { makeStaff, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const profileOf = (agent, name) => agent.get(`/api/members/${name}`);
const putPicture = (agent, buffer) =>
  agent.post('/api/profile/picture').set('Content-Type', 'application/octet-stream').send(buffer);
const files = () => uploadedFiles(t.config).sort();
const audits = () =>
  t.db.prepare('SELECT action, target_id AS target, before FROM audit_log ORDER BY id').all();

describe('seeing a profile', () => {
  it('members only: a guest gets 401', async () => {
    t = chatApp();
    await registerUser(t, 'mia');
    expect((await profileOf(t.client(), 'mia')).status).toBe(401);
    expect((await t.client().get('/api/members/mia/picture/full')).status).toBe(401);
  });

  it('shows name, role, member since, About me, steps and what one can do', async () => {
    t = chatApp();
    const { user: mia, agent: miaAgent } = await registerUser(t, 'mia');
    const { agent } = await registerUser(t, 'tom');
    await miaAgent.put('/api/profile/about').send({ about: '  Racing since season one.  ' });
    const { body } = await profileOf(agent, 'MIA'); // the name in any case
    const created = t.db.prepare('SELECT created_at FROM users WHERE id = ?').get(mia.id);
    expect(body.profile).toEqual({
      id: mia.id,
      username: 'mia',
      role: 'member',
      memberSince: created.created_at,
      about: 'Racing since season one.',
      picture: null,
      steps: [],
      canReceive: false,
      own: false,
    });
    expect((await profileOf(miaAgent, 'mia')).body.profile.own).toBe(true);
    expect((await profileOf(agent, 'nobody')).status).toBe(404);
  });

  it('a locked account is not found; a deleted one is gone with its picture files', async () => {
    t = chatApp();
    const { user: mia, agent: miaAgent } = await registerUser(t, 'mia');
    const { user: tom, agent: tomAgent } = await registerUser(t, 'tom');
    const { agent: admin } = await makeStaff(t, 'ada', 'admin');
    await putPicture(miaAgent, await makeImage('png'));
    await putPicture(tomAgent, await makeImage('png'));
    expect(files()).toHaveLength(4);

    await admin.post(`/api/admin/users/${mia.id}/lock`).send({ locked: true });
    expect((await profileOf(admin, 'mia')).status).toBe(404);
    expect((await admin.get('/api/members/mia/picture/full')).status).toBe(404);

    expect((await admin.delete(`/api/admin/users/${tom.id}`)).status).toBe(200);
    expect((await profileOf(admin, 'tom')).status).toBe(404);
    expect(files()).toHaveLength(2); // mia's stay: locked is not deleted
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM member_profiles').get().n).toBe(1);
  });
});

describe('About me', () => {
  it('at most 300 characters, an emoji counting once; no control characters', async () => {
    t = chatApp();
    const { agent } = await registerUser(t, 'mia');
    const about = (text) => agent.put('/api/profile/about').send({ about: text });
    expect((await about('a'.repeat(300))).status).toBe(200);
    expect((await about('a'.repeat(301))).status).toBe(400);
    expect((await about('🏁'.repeat(300))).status).toBe(200); // 600 UTF-16 units, 300 characters
    expect((await about('line one\nline two')).status).toBe(200);
    expect((await about('bell\u0007')).status).toBe(400);
    expect((await about(42)).status).toBe(400);
    expect((await about('')).status).toBe(200);
    expect((await profileOf(agent, 'mia')).body.profile.about).toBe('');
  });
});

describe('the picture', () => {
  it('is shown to members, never cached; images only, by the chat rules', async () => {
    t = chatApp();
    const { agent } = await registerUser(t, 'mia');
    const { agent: tom } = await registerUser(t, 'tom');
    expect((await putPicture(agent, await makeImage('png'))).status).toBe(201);
    const { picture } = (await profileOf(tom, 'mia')).body.profile;
    for (const address of [picture.full, picture.thumb]) {
      const res = await tom.get(address);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['cache-control']).toBe('private, no-store');
    }
    expect((await putPicture(agent, PDF)).body.message).toBe(
      'Allowed pictures: JPG, PNG, WebP and GIF.'
    );
    setSetting(t.db, 'chat.imageMaxMegapixels', 12);
    expect((await putPicture(agent, await largePng(5000, 3000))).status).toBe(400);
    setSetting(t.db, 'chat.uploadMaxMb', 1);
    expect((await putPicture(agent, Buffer.alloc(1.2 * 1024 * 1024))).status).toBe(413);
  });

  it('a new one replaces the old (its files go); removing it removes the files', async () => {
    t = chatApp();
    const { agent } = await registerUser(t, 'mia');
    await putPicture(agent, await makeImage('png'));
    const first = files();
    const before = (await profileOf(agent, 'mia')).body.profile.picture.full;
    await putPicture(agent, await makeImage('jpeg'));
    const second = files();
    expect(second).toHaveLength(2);
    expect(second.some((file) => first.includes(file))).toBe(false);
    expect((await profileOf(agent, 'mia')).body.profile.picture.full).not.toBe(before);

    expect((await agent.delete('/api/profile/picture')).status).toBe(200);
    expect(files()).toEqual([]);
    expect((await profileOf(agent, 'mia')).body.profile.picture).toBeNull();
    for (const file of second) {
      expect(existsSync(path.join(t.config.mediaDir, 'uploads', file))).toBe(false);
    }
  });
});

describe('moderation', () => {
  it('an admin clears About me and the picture, each audited without the text', async () => {
    t = chatApp();
    const { user: mia, agent } = await registerUser(t, 'mia');
    const { agent: admin } = await makeStaff(t, 'ada', 'admin');
    await agent.put('/api/profile/about').send({ about: 'Something rude' });
    await putPicture(agent, await makeImage('png'));
    expect((await admin.delete(`/api/admin/users/${mia.id}/about`)).status).toBe(200);
    expect((await admin.delete(`/api/admin/users/${mia.id}/picture`)).status).toBe(200);
    const { profile } = (await profileOf(admin, 'mia')).body;
    expect([profile.about, profile.picture]).toEqual(['', null]);
    expect(files()).toEqual([]);
    expect(audits().slice(-2)).toEqual([
      { action: 'user.profile_about_clear', target: String(mia.id), before: '{"username":"mia"}' },
      {
        action: 'user.profile_picture_clear',
        target: String(mia.id),
        before: '{"username":"mia"}',
      },
    ]);
    expect(JSON.stringify(audits())).not.toContain('rude');
  });

  it('members and organisers cannot clear', async () => {
    t = chatApp();
    const { user: mia } = await registerUser(t, 'mia');
    const { agent: tom } = await registerUser(t, 'tom');
    const { agent: olga } = await makeStaff(t, 'olga', 'organiser');
    expect((await tom.delete(`/api/admin/users/${mia.id}/about`)).status).toBe(403);
    expect((await olga.delete(`/api/admin/users/${mia.id}/picture`)).status).toBe(403);
  });
});
