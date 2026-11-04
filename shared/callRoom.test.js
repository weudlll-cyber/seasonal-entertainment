// ============================================================
// File:        callRoom.test.js
// Path:        shared/callRoom.test.js
// Project:     Seasonal Entertainment
// Description: Guards a call's chat room name and the page a room is shown on: a call's room on
//              its call page, every other room (including look-alikes) on the chat page.
// ============================================================

import { describe, expect, it } from 'vitest';
import { callRoomSlug, roomPagePath } from './callRoom.js';

describe('call rooms', () => {
  it('names a call room after its call, and shows it on the call page', () => {
    expect(callRoomSlug(12)).toBe('call-12');
    expect(roomPagePath(callRoomSlug(12))).toBe('/calls/12');
  });

  it('shows every other room on the chat page', () => {
    expect(roomPagePath('general')).toBe('/chat?room=general');
    expect(roomPagePath('call-')).toBe('/chat?room=call-');
    expect(roomPagePath('call-12-notes')).toBe('/chat?room=call-12-notes');
    expect(roomPagePath('my call-12')).toBe('/chat?room=my%20call-12');
  });
});
