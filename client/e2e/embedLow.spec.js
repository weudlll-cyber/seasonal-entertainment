// ============================================================
// File:        embedLow.spec.js
// Path:        client/e2e/embedLow.spec.js
// Project:     Seasonal Entertainment
// Description: The low forms of the embedded chat and call in a real browser, at the sizes a
//              game's 100 px docked strip gives them (/embed/chat in 267 x 90, /embed/call/<id>
//              in 267 x 94; docs/GAME-INTEGRATION.md section 9), as a signed-in member at a 16
//              and a 32 px root font: the input and at least two messages whole, the channel
//              picker reachable by keyboard, the call view's buttons whole (before listening and
//              while listening, against the run's own LiveKit), no page scroll inside either
//              frame, and no axe finding (WCAG 2.2 AA, target size included). The focused input's
//              ring lies wholly inside the chat frame, also at the strip's real width. "Open the
//              chat page" is reached by keyboard and opens the room's chat page in a new tab, for
//              a member and for a guest.
// ============================================================

import { expect, request as newRequest, test } from '@playwright/test';
import axe from 'axe-core';
import { ADMIN_STATE } from './adminState.js';
import { frameView } from './embeddedCall.js';
import { frameOf } from './frames.js';
import { memberPage } from './members.js';
import { DEV_PROXY_URL } from './ports.js';

// As callEmbed.spec.js: the fake media UI lets Chrome offer its real local addresses, which
// the run's local LiveKit needs.
test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  },
});

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// axe-core's findings inside one frame, as "rule: element" lines.
async function findings(frame) {
  await frame.evaluate(axe.source);
  return frame.evaluate(async (tags) => {
    const result = await window.axe.run(document, { runOnly: { type: 'tag', values: tags } });
    return result.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`));
  }, WCAG);
}

// The frame's page scrolls in neither direction.
const noScroll = (frame) =>
  frame.evaluate(() => {
    const page = document.documentElement;
    return page.scrollWidth <= window.innerWidth && page.scrollHeight <= window.innerHeight;
  });

// The element's box, and whether all of it shows: inside the frame, nothing of it or of its
// children cut off above or below by an ancestor.
const boxOf = (locator) =>
  locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    let whole =
      box.left >= 0 &&
      box.top >= 0 &&
      box.right <= window.innerWidth + 0.5 &&
      box.bottom <= window.innerHeight + 0.5;
    for (let up = element.parentElement; up; up = up.parentElement) {
      if (getComputedStyle(up).overflow === 'visible') continue;
      const clip = up.getBoundingClientRect();
      whole &&= box.top >= clip.top - 0.5 && box.bottom <= clip.bottom + 0.5;
      whole &&= box.left >= clip.left - 0.5 && box.right <= clip.right + 0.5;
    }
    for (const child of element.children) {
      const inner = child.getBoundingClientRect();
      // A select's options have no box of their own.
      if (!inner.width && !inner.height) continue;
      whole &&= inner.top >= box.top - 0.5 && inner.bottom <= box.bottom + 0.5;
    }
    return { width: box.width, height: box.height, whole };
  });

async function whole(locator, least = 0) {
  await expect(locator).toBeVisible();
  const box = await boxOf(locator);
  expect(box.whole, `whole: ${JSON.stringify(box)}`).toBe(true);
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(least);
}

const rootFont = (frame, size) =>
  frame.evaluate((px) => {
    document.documentElement.style.fontSize = px;
  }, size);

test('the dev server test page frames both at the strip’s sizes', async ({ page }) => {
  await page.goto(`${DEV_PROXY_URL}/games/strip-test/`);
  const chat = await page.getByTitle('Chat in the strip').boundingBox();
  expect(chat.height).toBe(90);
  const view = await page.getByTitle('Call view in the strip').boundingBox();
  expect([view.width, view.height]).toEqual([267, 94]);
  await page.getByRole('button', { name: 'Chat 267 px wide' }).click();
  expect((await page.getByTitle('Chat in the strip').boundingBox()).width).toBe(267);
});

// The focused element's ring (its outline box): drawn, and inside the frame's viewport and
// every ancestor that clips.
const ringOf = (locator) =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const width = parseFloat(style.outlineWidth);
    const out = parseFloat(style.outlineOffset) + width;
    const own = element.getBoundingClientRect();
    const ring = {
      left: own.left - out,
      top: own.top - out,
      right: own.right + out,
      bottom: own.bottom + out,
    };
    const within = (box) =>
      ring.left >= box.left - 0.5 &&
      ring.top >= box.top - 0.5 &&
      ring.right <= box.right + 0.5 &&
      ring.bottom <= box.bottom + 0.5;
    let inside = within({ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight });
    for (let up = element.parentElement; up; up = up.parentElement) {
      if (getComputedStyle(up).overflow !== 'visible')
        inside &&= within(up.getBoundingClientRect());
    }
    return { drawn: style.outlineStyle === 'solid' && width >= 2, inside };
  });

test('the input’s focus ring shows whole in the low chat, at both fonts and widths', async ({
  browser,
}) => {
  const { page } = await memberPage(browser, 'stripmember');
  await page.goto('/games/test-game/');
  const chat = await frameOf(page, '/embed/chat?room=general', {
    width: '267px',
    height: '90px',
    border: '0',
  });
  const field = chat.getByRole('textbox', { name: 'Message' });
  // 267 px, and the chat's width in the strip of a 1278 px window.
  for (const width of ['267px', '931px']) {
    await page.locator('iframe[title="framed"]').evaluate((frame, w) => {
      frame.style.width = w;
    }, width);
    for (const size of ['16px', '32px']) {
      await rootFont(chat, size);
      await field.focus();
      await expect
        .poll(() => ringOf(field), `${width} at ${size}`)
        .toEqual({ drawn: true, inside: true });
      await whole(field, 44);
    }
  }
});

test('"Open the chat page" opens the shown room from the keyboard, for members and guests', async ({
  browser,
}) => {
  const member = (await memberPage(browser, 'stripmember')).page;
  const guest = await (await browser.newContext()).newPage();
  for (const page of [member, guest]) {
    await page.goto('/games/test-game/');
    const chat = await frameOf(page, '/embed/chat?room=general', {
      width: '267px',
      height: '90px',
      border: '0',
    });
    const link = chat.getByRole('link', { name: 'Open the chat page' });
    await whole(link, 24);
    await chat.getByRole('textbox', { name: 'Message' }).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(link).toBeFocused();
    const [tab] = await Promise.all([
      page.context().waitForEvent('page'),
      page.keyboard.press('Enter'),
    ]);
    await expect(tab).toHaveURL(/\/chat\?room=general$/);
    await expect(tab.getByRole('region', { name: 'Chat: General' })).toBeVisible();
    // The game's page stays as it was.
    expect(new URL(page.url()).pathname).toBe('/games/test-game/');
    await tab.close();
  }
});

test('the low chat and call fit a 100 px docked strip at 16 and 32 px', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const api = await newRequest.newContext({
    baseURL,
    storageState: ADMIN_STATE,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const call = (await (await api.post('/api/calls', { data: { title: 'Strip night' } })).json())
    .call;
  expect((await api.post(`/api/calls/${call.id}/start`)).status()).toBe(200);

  const { page } = await memberPage(browser, 'stripmember');
  for (const body of ['first one', 'second one']) {
    const sent = await page.request.post('/api/chat/rooms/general/messages', {
      data: { body },
      headers: { Origin: baseURL },
    });
    expect(sent.status()).toBe(201);
  }
  await page.goto('/games/test-game/');
  const chat = await frameOf(page, '/embed/chat?room=general', {
    width: '267px',
    height: '90px',
    border: '0',
  });
  const view = (await frameView(page, `/embed/call/${call.id}`, { width: '267px', height: '94px' }))
    .frame;

  const field = chat.getByRole('textbox', { name: 'Message' });
  const picker = chat.getByRole('combobox', { name: 'Channel' });
  const rows = chat.getByRole('list', { name: /^Messages in / }).getByRole('listitem');
  const button = (name) => view.getByRole('button', { name });
  const callPage = view.getByRole('link', { name: 'Open the call page' });

  for (const size of ['16px', '32px']) {
    await rootFont(chat, size);
    await rootFont(view, size);

    await expect(chat.getByRole('tablist')).toHaveCount(0);
    await whole(field, 44);
    await whole(picker, 24);
    await whole(chat.getByRole('button', { name: 'Send' }), 44);
    await whole(chat.getByRole('link', { name: 'Open the chat page' }), 24);
    await expect.poll(() => rows.filter({ visible: true }).count()).toBeGreaterThanOrEqual(2);
    // Above the input at 16 px; at 32 px, where they would not fit there, beside it.
    const input = await picker.boundingBox();
    for (const row of await rows.filter({ visible: true }).all()) {
      await whole(row);
      const line = await row.boundingBox();
      expect(line.width).toBeGreaterThanOrEqual(80);
      if (size === '16px') expect(line.y + line.height).toBeLessThanOrEqual(input.y);
      else expect(line.x + line.width).toBeLessThanOrEqual(input.x);
    }
    expect(await noScroll(chat)).toBe(true);
    expect(await findings(chat)).toEqual([]);

    // Not listening yet.
    await whole(button('Listen'), 44);
    await whole(callPage, 44);
    await expect(button('Expand')).toHaveCount(0);
    await expect(button('Collapse')).toHaveCount(0);
    expect(await noScroll(view)).toBe(true);
    expect(await findings(view)).toEqual([]);

    // Listening: three buttons in the row.
    await button('Listen').click();
    await whole(button('Leave'), 44);
    await whole(button('Mute the call'), 44);
    await whole(callPage, 44);
    await whole(view.locator('.live-badge'));
    expect(await noScroll(view)).toBe(true);
    expect(await findings(view)).toEqual([]);
    await button('Leave').click();
    await whole(view.getByText('You left the call.'));
  }

  // The picker by keyboard: two steps back from the input (past "Open the chat page"), and it
  // switches the room.
  await rootFont(chat, '16px');
  await field.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(picker).toBeFocused();
  const before = await picker.inputValue();
  await page.keyboard.press('ArrowDown');
  await expect(picker).not.toHaveValue(before);
  await expect(chat.getByRole('region', { name: 'Chat: General' })).toHaveCount(0);

  expect((await api.post(`/api/calls/${call.id}/end`)).status()).toBe(200);
  await api.dispose();
});
