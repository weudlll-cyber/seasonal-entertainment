// ============================================================
// File:        embeddedCall.js
// Path:        client/e2e/embeddedCall.js
// Project:     Seasonal Entertainment
// Description: The call view inside a game, for the browser tests (callEmbed.spec.js,
//              callShared.spec.js): framing it in the current page as a game does, the messages
//              it posted, and the run's own call server's record of a participant.
// ============================================================

import { expect } from '@playwright/test';
import { RoomServiceClient } from 'livekit-server-sdk';
import { CALLS_PORT } from './ports.js';

const callServer = new RoomServiceClient(`http://127.0.0.1:${CALLS_PORT}`, 'devkey', 'secret');
// The call server's own record of one participant (any room).
export const participant = async (identity) => {
  const rooms = await callServer.listRooms();
  const people = (await Promise.all(rooms.map((r) => callServer.listParticipants(r.name)))).flat();
  return people.find((p) => p.identity === identity);
};

// Frames `src` in the current page at the slot's desktop size (or `box`), as a game does, and
// keeps every message from the view in window.callMessages.
export async function frameView(page, src, box = { width: '338px', height: '190px' }) {
  await page.evaluate(
    ([url, size]) => {
      window.callMessages = [];
      window.addEventListener('message', (event) => {
        if (event.data?.source === 'seasonal-call') window.callMessages.push(event.data);
      });
      const frame = document.createElement('iframe');
      frame.src = url;
      frame.title = 'call view';
      frame.allow = 'autoplay; fullscreen';
      Object.assign(frame.style, {
        position: 'fixed',
        right: '0',
        bottom: '0',
        ...size,
        border: '0',
        zIndex: '100',
      });
      document.body.append(frame);
      // A game sizes its slot as the view asks.
      window.addEventListener('message', (event) => {
        if (event.data?.source === 'seasonal-call' && event.data.type === 'resize') {
          frame.style.width = `${event.data.width}px`;
          frame.style.height = `${event.data.height}px`;
        }
      });
    },
    [src, box]
  );
  const element = page.locator('iframe[title="call view"]');
  await expect(element).toBeAttached();
  const frame = await (await element.elementHandle()).contentFrame();
  await frame.waitForLoadState();
  return { frame, element };
}

export const messages = (page, type) =>
  page.evaluate((t) => window.callMessages.filter((m) => m.type === t), type);
