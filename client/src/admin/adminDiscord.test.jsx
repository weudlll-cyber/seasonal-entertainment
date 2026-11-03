// ============================================================
// File:        adminDiscord.test.jsx
// Path:        client/src/admin/adminDiscord.test.jsx
// Project:     Seasonal Entertainment
// Description: Admin → Discord steps (SE-DISCORD-1 piece 3): the section only while Discord
//              login is set up; each ladder highest step first; saving a step's name and role id
//              (an empty id sent as none); moving a step up its ladder (the order sent lowest
//              first); uploading an icon (raw body); a step a room names cannot be removed; the
//              role ids without a step, with their counts; the room editor choosing the steps
//              that open a room (one per ladder, their ids sent).
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import App from '../app/App.jsx';
import { mockApi, signedIn, withFeatures } from '../test/mockApi.js';

const step = (id, ladder, name, position, extra = {}) => ({
  id,
  ladder,
  name,
  position,
  roleId: null,
  icon: null,
  rooms: [],
  ...extra,
});
const DATA = {
  ok: true,
  ladders: ['holder', 'farmer', 'investor'],
  steps: [
    step(1, 'holder', 'Holder', 1),
    step(2, 'holder', 'Bronze', 2, { roleId: '1110866352857690112' }),
    step(3, 'holder', 'Silver', 3, { rooms: ['VIP'] }),
    step(10, 'investor', 'Level 1', 1),
  ],
  unmapped: [{ roleId: '1110866376207372288', members: 3 }],
};
const ADMIN = signedIn({ id: 1, username: 'ada', role: 'admin', twoFactorEnabled: true });

function adminPage(features = { discord: true }) {
  const calls = mockApi({
    ...withFeatures(ADMIN, features),
    'GET /admin/discord': { body: DATA },
    'PUT /admin/discord/steps/1': { body: { ok: true } },
    'POST /admin/discord/ladders/holder/order': { body: { ok: true } },
    'POST /admin/discord/steps/2/icon?': { body: { ok: true } },
  });
  render(
    <MemoryRouter initialEntries={['/admin/discord']}>
      <App />
    </MemoryRouter>
  );
  return calls;
}

describe('Admin → Discord steps', () => {
  it('is a section only while Discord login is set up', async () => {
    adminPage({ discord: false });
    const nav = await screen.findByRole('navigation', { name: 'Admin' });
    expect(within(nav).queryByRole('link', { name: 'Discord steps' })).toBeNull();
  });

  it('lists each ladder highest step first, with the role ids still without a step', async () => {
    adminPage();
    const holder = await screen.findByRole('region', { name: 'Holder' });
    const names = within(holder)
      .getAllByRole('textbox', { name: /^Name of/ })
      .map((input) => input.value);
    expect(names).toEqual(['Silver', 'Bronze', 'Holder']);
    expect(screen.getByText('1110866376207372288')).toBeInTheDocument();
    expect(screen.getByText(/3 members/)).toBeInTheDocument();
  });

  it('saves a name and role id, an empty id as none', async () => {
    const calls = adminPage();
    const id = await screen.findByRole('textbox', { name: 'Discord role id of Holder' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Name of Holder' }), {
      target: { value: 'Holders' },
    });
    fireEvent.change(id, { target: { value: '  ' } });
    fireEvent.submit(id.closest('form'));
    await expect.poll(() => calls.find((c) => c.key === 'PUT /admin/discord/steps/1')).toBeTruthy();
    expect(calls.find((c) => c.key === 'PUT /admin/discord/steps/1').body).toEqual({
      name: 'Holders',
      roleId: null,
    });
  });

  it('moves a step up its ladder, sending the order lowest first', async () => {
    const calls = adminPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Move Holder up the ladder' }));
    await expect
      .poll(() => calls.find((c) => c.key === 'POST /admin/discord/ladders/holder/order'))
      .toBeTruthy();
    const sent = calls.find((c) => c.key === 'POST /admin/discord/ladders/holder/order').body;
    expect(sent).toEqual({ ids: [2, 1, 3] });
    // The highest step cannot go higher, the lowest no lower.
    expect(screen.getByRole('button', { name: 'Move Silver up the ladder' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Holder down the ladder' })).toBeDisabled();
  });

  it('uploads an icon as the raw body, and keeps a step a room names', async () => {
    const calls = adminPage();
    const file = new File(['png'], 'bronze.png', { type: 'image/png' });
    fireEvent.change(await screen.findByLabelText('Icon of Bronze'), { target: { files: [file] } });
    await expect
      .poll(() => calls.find((c) => c.key === 'POST /admin/discord/steps/2/icon?'))
      .toBeTruthy();
    expect(calls.find((c) => c.key === 'POST /admin/discord/steps/2/icon?').body).toBe(file);
    const silver = screen.getByRole('textbox', { name: 'Name of Silver' }).closest('li');
    expect(within(silver).getByRole('button', { name: 'Remove' })).toBeDisabled();
    expect(within(silver).getByText(/Rooms open from this step on: VIP/)).toBeInTheDocument();
  });
});

describe('the room editor with Discord steps', () => {
  it('chooses the steps that open a room, one per ladder, and sends their ids', async () => {
    const room = {
      id: 5,
      slug: 'whales',
      name: 'Whales',
      readAccess: 'members',
      writeAccess: 'members',
      guestWritable: false,
      stepRule: [{ id: 3, ladder: 'holder', position: 3 }],
    };
    const calls = mockApi({
      ...withFeatures(ADMIN, { discord: true }),
      'GET /admin/discord': { body: DATA },
      'GET /admin/chat/rooms': { body: { ok: true, rooms: [room] } },
      'GET /chat/reports': { body: { ok: true, messages: [] } },
      'GET /chat/sanctions': { body: { ok: true, sanctions: [] } },
      'PUT /admin/chat/rooms/5': { body: { ok: true } },
    });
    render(
      <MemoryRouter initialEntries={['/admin/chat']}>
        <App />
      </MemoryRouter>
    );
    const holder = await screen.findByRole('combobox', { name: 'Holder step that opens Whales' });
    expect(holder).toHaveValue('3');
    fireEvent.change(holder, { target: { value: '2' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Investor step that opens Whales' }), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    await expect.poll(() => calls.find((c) => c.key === 'PUT /admin/chat/rooms/5')).toBeTruthy();
    expect(calls.find((c) => c.key === 'PUT /admin/chat/rooms/5').body.stepIds).toEqual([2, 10]);
  });
});
