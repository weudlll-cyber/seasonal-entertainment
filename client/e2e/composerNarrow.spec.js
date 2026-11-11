// ============================================================
// File:        composerNarrow.spec.js
// Path:        client/e2e/composerNarrow.spec.js
// Project:     Seasonal Entertainment
// Description: The chat composer of the /chat page on a phone (decided 2026-11-11): at
//              360 x 740, 390 x 844 and a short 375 x 548 (a phone's window under its browser
//              bars), light and dark, in a room with an organiser's Poll button and in a direct
//              message, no button overlaps another or spills its text out of its box, every
//              button is a 44px target inside the window and inside the chat panel's card,
//              nothing scrolls sideways, the message field keeps a usable width and the message
//              list at least 8rem; at the two regular sizes the whole composer is in sight
//              without scrolling, also in a room with more messages than the list shows; at 360
//              the picker opens as wide as the message field.
// ============================================================

import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';
import { memberPage } from './members.js';

const SIZES = [
  [360, 740],
  [390, 844],
  [375, 548],
];
const SCHEMES = ['light', 'dark'];

// The visible composer, measured: buttons that overlap or whose content is wider than their
// box (its text spills over the next one), buttons under 44px, past the window's edge or out of
// the chat panel's card (its .se-chat box), the page's sideways overflow, the message field's
// width and the message list's height.
const measure = (page) =>
  page.evaluate(() => {
    const form = [...document.querySelectorAll('form.chat-composer')].find(
      (f) => f.getBoundingClientRect().width > 0
    );
    const card = form.closest('.se-chat');
    const panel = card.getBoundingClientRect();
    const buttons = [...form.querySelectorAll('.chat-composer__actions button')]
      .map((el) => ({ el, box: el.getBoundingClientRect(), name: el.textContent.trim() }))
      .filter(({ box }) => box.width > 0);
    const apart = (a, b) =>
      a.right <= b.left + 0.5 ||
      b.right <= a.left + 0.5 ||
      a.bottom <= b.top + 0.5 ||
      b.bottom <= a.top + 0.5;
    const overlaps = [];
    buttons.forEach((a, i) =>
      buttons.slice(i + 1).forEach((b) => {
        if (!apart(a.box, b.box)) overlaps.push(`${a.name} / ${b.name}`);
      })
    );
    return {
      names: buttons.map((b) => b.name),
      overlaps,
      spilling: buttons.filter(({ el }) => el.scrollWidth > el.clientWidth + 1).map((b) => b.name),
      short: buttons.filter(({ box }) => box.height < 44).map((b) => b.name),
      outside: buttons.filter(({ box }) => box.right > window.innerWidth).map((b) => b.name),
      outsidePanel: buttons
        .filter(
          ({ box }) =>
            box.top < panel.top ||
            box.bottom > panel.bottom ||
            box.left < panel.left ||
            box.right > panel.right
        )
        .map((b) => b.name),
      sideways: document.documentElement.scrollWidth - window.innerWidth,
      field: form.querySelector('textarea').getBoundingClientRect().width,
      list: card.querySelector('.chat-messages').getBoundingClientRect().height,
      belowWindow: buttons.filter(({ box }) => box.bottom > window.innerHeight).map((b) => b.name),
    };
  });

// Every size and theme on the same page; expected: the buttons the surface offers.
async function expectFits(page, expected) {
  for (const [width, height] of SIZES) {
    for (const colorScheme of SCHEMES) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme });
      // After the resize, once a composer is drawn again.
      await page.waitForFunction(() =>
        [...document.querySelectorAll('form.chat-composer')].some(
          (f) => f.getBoundingClientRect().width > 0
        )
      );
      const got = await measure(page);
      const at = `${width} x ${height}, ${colorScheme}`;
      expect(got.names, at).toEqual(expected);
      expect(got.overlaps, `${at}: overlapping`).toEqual([]);
      expect(got.spilling, `${at}: text past its button`).toEqual([]);
      expect(got.short, `${at}: under 44px`).toEqual([]);
      expect(got.outside, `${at}: past the window`).toEqual([]);
      expect(got.outsidePanel, `${at}: out of the chat panel's card`).toEqual([]);
      expect(got.sideways, `${at}: sideways scroll`).toBeLessThanOrEqual(0);
      // The field stands above the buttons, as wide as the composer: 70% of the window or more.
      expect(got.field, `${at}: message field`).toBeGreaterThanOrEqual(width * 0.7);
      // The composer's room comes from the list above it, which keeps a few messages in sight.
      expect(got.list, `${at}: message list`).toBeGreaterThanOrEqual(127);
      // A regular phone needs no scrolling to reach the composer; only a short window does.
      if (height >= 740) expect(got.belowWindow, `${at}: below the window`).toEqual([]);
    }
  }
}

test("a room's composer with the Poll button fits a phone", async ({ browser }) => {
  // More messages than the list shows at 390 x 844, so they must scroll inside it, not the
  // page. A member of this spec writes them: the run's admin writes in many specs at once and
  // would meet its sending limit.
  const { page: writer } = await memberPage(browser, 'narrowposter');
  await writer.goto('/chat');
  const lines = [];
  for (let i = 1; i <= 4; i++) {
    const text = `narrow composer line ${i} ${Date.now()}`;
    await writer.getByLabel('Message', { exact: true }).fill(text);
    await writer.getByRole('button', { name: 'Send' }).click();
    await expect(
      writer.getByRole('list', { name: 'Messages in General' }).getByText(text)
    ).toBeVisible();
    lines.push(text);
  }
  const page = await (await browser.newContext({ storageState: ADMIN_STATE })).newPage();
  await page.goto('/chat');
  await expect(page.getByRole('button', { name: 'Poll' })).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Messages in General' }).getByText(lines[3])
  ).toBeAttached();
  await expectFits(page, ['Emoji, stickers, GIFs', 'Attach file', 'Poll', 'Send']);

  // The picker opens as wide as the message field, not as narrow as its button.
  await page.setViewportSize({ width: 360, height: 740 });
  await page.getByRole('button', { name: /^Emoji/ }).click();
  const panel = await page.locator('#chat-picker-panel').boundingBox();
  const field = await page.getByLabel('Message', { exact: true }).boundingBox();
  expect(Math.abs(panel.width - field.width)).toBeLessThanOrEqual(2);
});

test("a direct message's composer fits a phone", async ({ browser }) => {
  const recipient = await memberPage(browser, 'narrowrecip');
  const sender = await memberPage(browser, 'narrowsend');
  // The recipient writes in General, so the sender has a name to open a conversation from.
  await recipient.page.goto('/chat');
  const hello = `hello from narrowrecip ${Date.now()}`;
  await recipient.page.getByLabel('Message', { exact: true }).fill(hello);
  await recipient.page.getByRole('button', { name: 'Send' }).click();
  await recipient.page.getByRole('tab', { name: 'Direct' }).click();
  await expect(
    recipient.page
      .getByRole('list', { name: 'Private conversations' })
      .or(recipient.page.getByText('No private conversations yet.', { exact: false }))
  ).toBeVisible();

  await sender.page.goto('/chat');
  await sender.page
    .getByRole('list', { name: 'Messages in General' })
    .getByRole('listitem')
    .filter({ hasText: hello })
    .getByRole('button', { name: 'narrowrecip', exact: true })
    .click();
  await sender.page.getByRole('menuitem', { name: 'Send private message' }).click();
  await expect(
    sender.page.getByRole('list', { name: 'Private messages with narrowrecip' })
  ).toBeVisible();
  // The conversation's composer comes once its keys are ready.
  await expect(sender.page.getByLabel('Message', { exact: true })).toBeVisible();
  await expectFits(sender.page, ['Emoji, stickers, GIFs', 'Attach file', 'Send']);
});
