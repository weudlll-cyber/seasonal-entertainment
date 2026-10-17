// ============================================================
// File:        info.test.js
// Path:        server/test/info.test.js
// Project:     Seasonal Entertainment
// Description: Guards info pages: drafts invisible to the public, published visible, the
//              editor for admins only, every change audited, slug rules and reordering.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { makeStaff, makeTestApp, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const auditActions = () =>
  t.db
    .prepare('SELECT action FROM audit_log ORDER BY id')
    .all()
    .map((r) => r.action);

async function adminWithPage(slug = 'faq', title = 'FAQ') {
  const { agent } = await makeStaff(t, 'ada', 'admin');
  const created = await agent.post('/api/admin/info').send({ slug, title, body: '## Hello' });
  expect(created.status).toBe(201);
  return { agent, page: created.body.page };
}

describe('public visibility', () => {
  it('a draft is not visible; once published it is', async () => {
    t = makeTestApp();
    const { agent, page } = await adminWithPage();
    expect((await t.client().get('/api/info')).body.pages).toEqual([]);
    expect((await t.client().get('/api/info/faq')).status).toBe(404);

    await agent.post(`/api/admin/info/${page.id}/status`).send({ status: 'published' });
    expect((await t.client().get('/api/info')).body.pages).toEqual([{ slug: 'faq', title: 'FAQ' }]);
    const shown = await t.client().get('/api/info/faq');
    expect(shown.body.page).toMatchObject({ slug: 'faq', title: 'FAQ', body: '## Hello' });

    await agent.post(`/api/admin/info/${page.id}/status`).send({ status: 'draft' });
    expect((await t.client().get('/api/info/faq')).status).toBe(404);
  });
});

describe('editor', () => {
  it('requires an admin', async () => {
    t = makeTestApp();
    const { agent: member } = await registerUser(t, 'mia');
    const { agent: organiser } = await makeStaff(t, 'olga', 'organiser');
    for (const agent of [member, organiser]) {
      expect((await agent.get('/api/admin/info')).status).toBe(403);
      expect(
        (await agent.post('/api/admin/info').send({ slug: 'x', title: 'X', body: '' })).status
      ).toBe(403);
    }
    expect((await t.client().get('/api/admin/info')).status).toBe(401);
  });

  it('every change is audited: create, edit (only what changed), publish', async () => {
    t = makeTestApp();
    const { agent, page } = await adminWithPage();
    const edit = await agent
      .put(`/api/admin/info/${page.id}`)
      .send({ slug: 'faq', title: 'Questions', body: '## Hello again' });
    expect(edit.status).toBe(200);
    expect(edit.body.page).toMatchObject({ title: 'Questions', updatedBy: 'ada' });
    await agent.post(`/api/admin/info/${page.id}/status`).send({ status: 'published' });
    expect(auditActions()).toEqual(['info.create', 'info.edit', 'info.publish']);
    const editEntry = t.db
      .prepare("SELECT before, after FROM audit_log WHERE action = 'info.edit'")
      .get();
    expect(JSON.parse(editEntry.before)).toEqual({ title: 'FAQ', bodyLength: 8 });
    expect(JSON.parse(editEntry.after)).toEqual({ title: 'Questions', bodyLength: 14 });
  });

  it('refuses a bad or duplicate slug', async () => {
    t = makeTestApp();
    const { agent } = await adminWithPage('faq');
    const bad = await agent.post('/api/admin/info').send({ slug: 'Not OK', title: 'X', body: '' });
    expect(bad.status).toBe(400);
    const dup = await agent.post('/api/admin/info').send({ slug: 'faq', title: 'Again', body: '' });
    expect(dup.status).toBe(409);
    expect(auditActions()).toEqual(['info.create']);
  });

  it('reorders the public list; an incomplete order is refused', async () => {
    t = makeTestApp();
    const { agent, page: a } = await adminWithPage('first', 'First');
    const b = (
      await agent.post('/api/admin/info').send({ slug: 'second', title: 'Second', body: '' })
    ).body.page;
    for (const p of [a, b])
      await agent.post(`/api/admin/info/${p.id}/status`).send({ status: 'published' });
    expect((await agent.post('/api/admin/info/reorder').send({ ids: [b.id] })).status).toBe(400);
    expect((await agent.post('/api/admin/info/reorder').send({ ids: [b.id, a.id] })).status).toBe(
      200
    );
    const slugs = (await t.client().get('/api/info')).body.pages.map((p) => p.slug);
    expect(slugs).toEqual(['second', 'first']);
    expect(auditActions().at(-1)).toBe('info.reorder');
  });
});
