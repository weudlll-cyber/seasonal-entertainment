// ============================================================
// File:        discordAdmin.test.js
// Path:        server/test/discordAdmin.test.js
// Project:     Seasonal Entertainment
// Description: Admin's Discord steps (docs/AUTH.md, "Discord: steps"; SE-DISCORD-1 piece 3):
//              admins only; the seeded ladders; add, rename, set a role id (a snowflake, unique),
//              reorder (every step of the ladder once), remove (not a step a room names); icons
//              (PNG and clean SVG drawn into a 64 x 64 WebP and served from /media/step-icons/;
//              an SVG that could reach out or run anything refused); the role ids seen on members
//              that no step has (ids and counts only); one audit entry per change; the routes
//              absent while Discord is not set up. "Icon from link" against a pretend internet
//              (helpers/previewNet.js, no real network): Discord's two image hosts only, no
//              redirect, an image type, at most 2 MB; fetched once and stored like an upload
//              (the same pipeline refuses the same SVG); a clear message for each refusal.
// ============================================================

import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { seedSteps } from '../src/discord/steps.js';
import { DISCORD_TEST, fakeDiscord } from './helpers/fakeDiscord.js';
import { PUBLIC_IP, previewInternet, redirect } from './helpers/previewNet.js';
import { makeStaff, makeTestApp, registerUser } from './helpers/testApp.js';

let t;
let net;
afterEach(async () => {
  t?.close();
  await net?.close();
  net = undefined;
});

const ROLE_A = '1110866352857690112';
const ROLE_B = '1110866376207372288';

async function setup(previewNetwork) {
  t = makeTestApp({ discord: DISCORD_TEST }, { discordFetch: fakeDiscord().fetch, previewNetwork });
  seedSteps(t.db);
  const { agent } = await makeStaff(t, 'boss', 'admin');
  return agent;
}

const stepNamed = async (admin, name) =>
  (await admin.get('/api/admin/discord')).body.steps.find((s) => s.name === name);
const audits = (action) =>
  t.db.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE action = ?').get(action).n;
const png = () =>
  sharp({ create: { width: 200, height: 100, channels: 4, background: '#808080' } })
    .png()
    .toBuffer();
const upload = (admin, id, body) =>
  admin
    .post(`/api/admin/discord/steps/${id}/icon`)
    .set('Content-Type', 'application/octet-stream')
    .send(body);

describe('the admins’ steps', () => {
  it('are for admins only, and absent while Discord is not set up', async () => {
    await setup();
    const { agent: member } = await registerUser(t, 'anna');
    expect((await member.get('/api/admin/discord')).status).toBe(403);
    expect((await t.client().get('/api/admin/discord')).status).toBe(401);
    t.close();
    t = makeTestApp();
    const { agent } = await makeStaff(t, 'boss', 'admin');
    expect((await agent.get('/api/admin/discord')).status).toBe(404);
  });

  it('start with the three seeded ladders, names only', async () => {
    const admin = await setup();
    const { body } = await admin.get('/api/admin/discord');
    expect(body.ladders).toEqual(['holder', 'farmer', 'investor']);
    const names = (ladder) => body.steps.filter((s) => s.ladder === ladder).map((s) => s.name);
    expect(names('holder')).toHaveLength(9);
    expect(names('holder').at(-1)).toBe('Ultimate-Dragon Whale');
    expect(names('farmer').at(-1)).toBe('Ultimate-Farmer Whale');
    expect(names('investor')).toEqual(['Level 1', 'Level 2', 'Level 3', 'Level 4']);
    expect(body.steps.every((s) => s.roleId === null && s.icon === null)).toBe(true);
    // Seeding again adds nothing, also after the list was emptied.
    expect(seedSteps(t.db)).toBe(0);
  });

  it('take a role id that is a snowflake and not used by another step', async () => {
    const admin = await setup();
    const golden = await stepNamed(admin, 'Golden');
    const bad = await admin.put(`/api/admin/discord/steps/${golden.id}`).send({
      name: 'Golden',
      roleId: 'abc',
    });
    expect(bad.status).toBe(400);
    const ok = await admin
      .put(`/api/admin/discord/steps/${golden.id}`)
      .send({ name: 'Gold', roleId: ROLE_A });
    expect(ok.body.step).toMatchObject({ name: 'Gold', roleId: ROLE_A });
    const silver = await stepNamed(admin, 'Silver');
    const taken = await admin
      .put(`/api/admin/discord/steps/${silver.id}`)
      .send({ name: 'Silver', roleId: ROLE_A });
    expect(taken.status).toBe(409);
    expect(audits('discord.step_edit')).toBe(1);
  });

  it('are added at the top of a ladder, reordered and removed', async () => {
    const admin = await setup();
    const added = await admin
      .post('/api/admin/discord/steps')
      .send({ ladder: 'investor', name: 'Level 5', roleId: null });
    expect(added.status).toBe(201);
    expect(added.body.step.position).toBe(5);
    const { body } = await admin.get('/api/admin/discord');
    const ids = body.steps.filter((s) => s.ladder === 'investor').map((s) => s.id);
    const missing = await admin
      .post('/api/admin/discord/ladders/investor/order')
      .send({ ids: ids.slice(1) });
    expect(missing.status).toBe(400);
    await admin.post('/api/admin/discord/ladders/investor/order').send({ ids: [...ids].reverse() });
    const after = (await admin.get('/api/admin/discord')).body.steps
      .filter((s) => s.ladder === 'investor')
      .map((s) => s.name);
    expect(after).toEqual(['Level 5', 'Level 4', 'Level 3', 'Level 2', 'Level 1']);
    expect((await admin.delete(`/api/admin/discord/steps/${added.body.step.id}`)).status).toBe(200);
    expect(audits('discord.step_create')).toBe(1);
    expect(audits('discord.ladder_reorder')).toBe(1);
    expect(audits('discord.step_delete')).toBe(1);
  });

  it('cannot remove a step a room is open from', async () => {
    const admin = await setup();
    const golden = await stepNamed(admin, 'Golden');
    const room = t.db
      .prepare(
        "INSERT INTO chat_rooms (slug, name, read_access, write_access) VALUES ('vip', 'VIP', 'members', 'members')"
      )
      .run().lastInsertRowid;
    t.db
      .prepare('INSERT INTO room_step_rules (room_id, step_id) VALUES (?, ?)')
      .run(room, golden.id);
    const res = await admin.delete(`/api/admin/discord/steps/${golden.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('step_in_use');
    expect((await stepNamed(admin, 'Golden')).rooms).toHaveLength(1);
  });

  it('list the role ids members carry that no step has, with counts only', async () => {
    const admin = await setup();
    const golden = await stepNamed(admin, 'Golden');
    await admin
      .put(`/api/admin/discord/steps/${golden.id}`)
      .send({ name: 'Golden', roleId: ROLE_A });
    const insert = t.db.prepare(
      `INSERT INTO discord_links (user_id, discord_id, discord_name, status, role_ids, linked_at, next_refresh_at)
       VALUES (?, ?, 'x', ?, ?, 'now', 'later')`
    );
    const { user: a } = await registerUser(t, 'anna');
    const { user: b } = await registerUser(t, 'bert');
    const { user: c } = await registerUser(t, 'cleo');
    insert.run(a.id, '300000000000000001', 'member', JSON.stringify([ROLE_A, ROLE_B]));
    insert.run(b.id, '300000000000000002', 'member', JSON.stringify([ROLE_B]));
    // Not on the server: its old roles do not count.
    insert.run(c.id, '300000000000000003', 'not_member', JSON.stringify([ROLE_B]));
    const { body } = await admin.get('/api/admin/discord');
    expect(body.unmapped).toEqual([{ roleId: ROLE_B, members: 2 }]);
  });
});

describe('step icons', () => {
  it('are drawn into a 64 x 64 WebP served from this site, the old one removed', async () => {
    const admin = await setup();
    const golden = await stepNamed(admin, 'Golden');
    const first = await upload(admin, golden.id, await png());
    expect(first.status).toBe(200);
    expect(first.body.step.icon).toMatch(/^\/media\/step-icons\/[0-9a-f]{32}\.webp$/);
    const served = await t.client().get(first.body.step.icon).buffer(true);
    expect(served.status).toBe(200);
    expect(await sharp(served.body).metadata()).toMatchObject({
      format: 'webp',
      width: 64,
      height: 64,
    });
    const firstFile = path.join(t.config.mediaDir, first.body.step.icon.replace('/media/', ''));
    expect(existsSync(firstFile)).toBe(true);
    await upload(admin, golden.id, await png());
    expect(existsSync(firstFile)).toBe(false);
    expect(audits('discord.step_icon')).toBe(2);
  });

  it('take a clean SVG and refuse one that could run or reach anything', async () => {
    const admin = await setup();
    const golden = await stepNamed(admin, 'Golden');
    const svg = (inner) =>
      Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20">${inner}</svg>`);
    const clean = await upload(
      admin,
      golden.id,
      svg('<defs><linearGradient id="g"/></defs><circle cx="10" cy="10" r="9" fill="url(#g)"/>')
    );
    expect(clean.status).toBe(200);
    for (const bad of [
      '<script>alert(1)</script>',
      '<image href="https://evil.example/x.png"/>',
      '<rect onload="x()"/>',
      '<foreignObject></foreignObject>',
      '<rect style="fill:url(https://evil.example/a)"/>',
    ]) {
      const res = await upload(admin, golden.id, svg(bad));
      expect(res.status, bad).toBe(400);
    }
    const doctype = Buffer.from('<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "y">]><svg/>');
    expect((await upload(admin, golden.id, doctype)).status).toBe(400);
  });

  it('refuse what is no image, and can be cleared', async () => {
    const admin = await setup();
    const golden = await stepNamed(admin, 'Golden');
    expect((await upload(admin, golden.id, Buffer.from('not an image'))).status).toBe(400);
    await upload(admin, golden.id, await png());
    expect((await admin.delete(`/api/admin/discord/steps/${golden.id}/icon`)).status).toBe(200);
    expect((await stepNamed(admin, 'Golden')).icon).toBeNull();
  });
});

describe('icon from link', () => {
  const CDN = 'cdn.discordapp.com';
  const MEDIA = 'media.discordapp.net';
  const image = (type, body) => (_req, res) => {
    res.setHeader('Content-Type', type);
    res.end(body);
  };

  // The pretend internet: Discord's two hosts and one outside host, all on a public address.
  async function withInternet(routes) {
    net = await previewInternet(routes, {
      [CDN]: [PUBLIC_IP],
      'evil.example': [PUBLIC_IP],
    });
    const admin = await setup(net.network);
    const golden = await stepNamed(admin, 'Golden');
    const fromLink = (url) =>
      admin.post(`/api/admin/discord/steps/${golden.id}/icon-link`).send({ url });
    return { admin, golden, fromLink };
  }

  it('fetches the image once and stores it like an upload', async () => {
    const pic = await png();
    const { fromLink } = await withInternet({
      [`${CDN}/role-icons/1/a.png?size=64`]: image('image/png', pic),
    });
    const res = await fromLink(`https://${CDN}/role-icons/1/a.png?size=64`);
    expect(res.status).toBe(200);
    expect(res.body.step.icon).toMatch(/^\/media\/step-icons\/[0-9a-f]{32}\.webp$/);
    const served = await t.client().get(res.body.step.icon).buffer(true);
    expect(await sharp(served.body).metadata()).toMatchObject({ format: 'webp', width: 64 });
    // Served from this site: Discord was asked exactly once.
    expect(net.requests).toHaveLength(1);
    expect(net.requests[0].headers['user-agent']).toMatch(/^SeasonalEntertainmentIcons\//);
    expect(audits('discord.step_icon')).toBe(1);
  });

  it('takes only https links to the two Discord hosts, without asking anyone else', async () => {
    const { fromLink } = await withInternet({});
    for (const url of [
      'https://evil.example/a.png',
      `https://${CDN}.evil.example/a.png`,
      `https://evil.example/${CDN}/a.png`,
      `http://${CDN}/a.png`,
      `https://${CDN}:8443/a.png`,
      'not a link',
    ]) {
      const res = await fromLink(url);
      expect(res.status, url).toBe(400);
      expect(res.body.message, url).toBe(
        'Only https links to cdn.discordapp.com or media.discordapp.net are accepted.'
      );
    }
    expect(net.lookups).toEqual([]);
    expect(audits('discord.step_icon')).toBe(0);
  });

  it('says why: not an image, too large, unreachable, a redirect', async () => {
    const { admin, fromLink } = await withInternet({
      [`${CDN}/page.png`]: image('text/html', '<html></html>'),
      // No length announced: the transfer itself is cut after 2 MB.
      [`${CDN}/big.png`]: (_req, res) => {
        res.setHeader('Content-Type', 'image/png');
        const chunk = Buffer.alloc(256 * 1024);
        for (let i = 0; i < 9; i++) res.write(chunk);
        res.end();
      },
      [`${CDN}/moved.png`]: redirect('https://evil.example/a.png'),
      // An error answer that still claims an image type (a 404 page is text: "not an image").
      [`${CDN}/gone.png`]: (_req, res) => {
        res.statusCode = 404;
        image('image/png', '')(_req, res);
      },
    });
    const said = async (url) => (await fromLink(url)).body.message;
    expect(await said(`https://${CDN}/page.png`)).toBe('The link does not lead to an image.');
    expect(await said(`https://${CDN}/big.png`)).toBe('The image is larger than 2 MB.');
    // media.discordapp.net has no address in this pretend internet.
    expect(await said(`https://${MEDIA}/a.png`)).toMatch(/unreachable or did not answer in time/);
    expect(await said(`https://${CDN}/gone.png`)).toBe(
      'The image could not be fetched: Discord answered 404.'
    );
    expect(await said(`https://${CDN}/moved.png`)).toBe(
      'The link redirects elsewhere. Use the image’s direct link.'
    );
    expect(net.hits('evil.example/a.png')).toBe(0);
    expect((await stepNamed(admin, 'Golden')).icon).toBeNull();
  });

  it('goes through the upload pipeline: the same unsafe SVG is refused', async () => {
    const { fromLink } = await withInternet({
      [`${CDN}/a.svg`]: image(
        'image/svg+xml',
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
      ),
    });
    const res = await fromLink(`https://${CDN}/a.svg`);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: 'invalid_file',
      message: 'An SVG icon may not contain scripts.',
    });
  });

  it('is for admins only', async () => {
    await withInternet({});
    const golden = (await t.db.prepare("SELECT id FROM discord_steps WHERE name = 'Golden'").get())
      .id;
    const { agent: member } = await registerUser(t, 'anna');
    const res = await member
      .post(`/api/admin/discord/steps/${golden}/icon-link`)
      .send({ url: `https://${CDN}/a.png` });
    expect(res.status).toBe(403);
    expect(net.requests).toHaveLength(0);
  });
});
