// ============================================================
// File:        profiles.test.jsx
// Path:        client/src/profiles/profiles.test.jsx
// Project:     Seasonal Entertainment
// Description: Member profiles in the client (docs/AUTH.md, "Member profiles"): a guest at
//              /members/<name> gets the sign-in page; a member sees the name, the role, "Member
//              since" as a date in their own time zone and About me as plain text (a web address
//              in it never becomes a link); "Send message" opens the direct conversation, not on
//              one's own profile nor where they cannot receive one; an unknown name says so; an
//              admin clears About me and the picture (asked first); the account page's Profile
//              section refuses 301 characters before asking the server, saves About me and
//              uploads a picture. ("View profile" in a chat name's menu: chatFavourites.test.jsx.)
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
import { formatDate } from '../app/dates.js';
import { onDirectRequest } from '../chat/index.js';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';

const ZOE = {
  id: 8,
  username: 'zoe',
  role: 'organiser',
  memberSince: '2026-03-04T23:30:00.000Z',
  about: 'Racing since season one. See https://example.org/zoe',
  picture: {
    full: '/api/members/zoe/picture/full?v=1',
    thumb: '/api/members/zoe/picture/thumb?v=1',
  },
  steps: [],
  canReceive: true,
  own: false,
};

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => vi.unstubAllGlobals());

function renderAt(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

// mia (role) looking at a profile; answers: more API answers.
function asMember(profile, { role = 'member', answers = {} } = {}) {
  return mockApi({
    ...signedIn({ id: 1, username: 'mia', role }),
    [`GET /members/${profile.username}`]: { body: { ok: true, profile } },
    ...answers,
  });
}

describe('the profile page', () => {
  it('a guest gets the sign-in page', async () => {
    mockApi(GUEST);
    renderAt('/members/zoe');
    expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument();
  });

  it('shows name, role, member since in the viewer zone and About me as plain text', async () => {
    asMember(ZOE);
    renderAt('/members/zoe');
    expect(await screen.findByRole('heading', { name: 'zoe', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Organiser')).toBeInTheDocument();
    expect(screen.getByText(`Member since ${formatDate(ZOE.memberSince)}`)).toBeInTheDocument();
    const about = screen.getByText(ZOE.about);
    expect(about.tagName).toBe('P');
    expect(within(about).queryByRole('link')).toBeNull();
    expect(screen.getByRole('img', { name: 'Profile picture of zoe' })).toHaveAttribute(
      'src',
      ZOE.picture.full
    );
    // A member cannot moderate.
    expect(screen.queryByRole('button', { name: 'Clear About me' })).toBeNull();
  });

  it('"Send message" opens the direct conversation', async () => {
    const requested = [];
    const stop = onDirectRequest((partner) => requested.push(partner));
    asMember(ZOE);
    renderAt('/members/zoe');
    fireEvent.click(await screen.findByRole('button', { name: 'Send message' }));
    expect(requested).toEqual([{ id: 8, username: 'zoe' }]);
    stop();
  });

  it('no "Send message" on one own profile or where none can be received', async () => {
    asMember({ ...ZOE, canReceive: false });
    renderAt('/members/zoe');
    await screen.findByRole('heading', { name: 'zoe', level: 1 });
    expect(screen.queryByRole('button', { name: 'Send message' })).toBeNull();
  });

  it('on one own profile: a link to edit it, no "Send message"', async () => {
    asMember({ ...ZOE, username: 'mia', id: 1, own: true });
    renderAt('/members/mia');
    expect(await screen.findByRole('link', { name: 'Edit my profile' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send message' })).toBeNull();
  });

  it('an unknown name says so', async () => {
    mockApi({
      ...signedIn({ username: 'mia', role: 'member' }),
      'GET /members/nobody': {
        status: 404,
        body: { ok: false, error: 'not_found', message: 'No such member.' },
      },
    });
    renderAt('/members/nobody');
    expect(await screen.findByRole('heading', { name: 'Member not found' })).toBeInTheDocument();
  });

  it('an admin clears About me and the picture, asked first', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    );
    const calls = asMember(ZOE, {
      role: 'admin',
      answers: {
        'DELETE /admin/users/8/about': { body: { ok: true } },
        'DELETE /admin/users/8/picture': { body: { ok: true } },
      },
    });
    renderAt('/members/zoe');
    fireEvent.click(await screen.findByRole('button', { name: 'Clear About me' }));
    await vi.waitFor(() =>
      expect(calls.some((c) => c.key === 'DELETE /admin/users/8/about')).toBe(true)
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove picture' }));
    await vi.waitFor(() =>
      expect(calls.some((c) => c.key === 'DELETE /admin/users/8/picture')).toBe(true)
    );
    expect(window.confirm).toHaveBeenCalledTimes(2);
  });
});

describe("the account page's Profile section", () => {
  it('refuses 301 characters before asking the server; saves About me', async () => {
    const calls = mockApi({
      ...signedIn({ username: 'mia', role: 'member' }),
      'PUT /profile/about': { body: { ok: true } },
    });
    renderAt('/account#profile');
    const field = await screen.findByRole('textbox', { name: /About me/ });
    fireEvent.change(field, { target: { value: 'a'.repeat(301) } });
    expect(screen.getByText(/301 \/ 300 characters/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save About me' }));
    expect(await screen.findByText('About me can be at most 300 characters.')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'PUT /profile/about')).toBe(false);

    fireEvent.change(field, { target: { value: 'Hello from Vienna' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save About me' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.key === 'PUT /profile/about')?.body).toEqual({
        about: 'Hello from Vienna',
      })
    );
  });

  it('uploads a chosen picture', async () => {
    const calls = mockApi({
      ...signedIn({ username: 'mia', role: 'member' }),
      'POST /profile/picture?': { status: 201, body: { ok: true } },
    });
    renderAt('/account#profile');
    const input = await screen.findByLabelText('Profile picture file');
    const file = new File(['png'], 'me.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    await vi.waitFor(() =>
      expect(calls.some((c) => c.key === 'POST /profile/picture?')).toBe(true)
    );
  });
});
