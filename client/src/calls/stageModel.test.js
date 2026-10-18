// ============================================================
// File:        stageModel.test.js
// Path:        client/src/calls/stageModel.test.js
// Project:     Seasonal Entertainment
// Description: The call page's rules (stageModel.js): people from LiveKit participants,
//              audience order (hands first by time, then names, hidden listeners last), finding
//              listeners (hidden ones never by name), the spotlight from the room metadata
//              (only a speaker on the stage now) and, without one, a screen share shown large
//              anyway; numbered names for hidden listeners; the no-sound notice for screen
//              sharing — how to share with sound in Chromium browsers, the browser hint in
//              others — and telling Chromium browsers apart.
// ============================================================

import { describe, expect, it } from 'vitest';
import {
  HIDDEN_LISTENER,
  NO_SHARE_AUDIO,
  NO_SOUND_SHARED,
  audienceOrder,
  findListeners,
  isChromium,
  listenerNames,
  personOf,
  shareAudioNotice,
  shownLarge,
  spotlightOf,
  spotlightSpeaker,
} from './stageModel.js';

const person = (name, extra = {}) => ({
  identity: `p-${name}`,
  name,
  hand: false,
  handAt: '',
  speaker: false,
  ...extra,
});

describe('people', () => {
  it('reads kind, hand and the stage from what the server set', () => {
    const p = personOf({
      identity: 'p-1',
      name: 'mia',
      attributes: { kind: 'guest', hand: '1', handAt: '2026-10-19T10:00:00Z' },
      permissions: { canPublish: false },
    });
    expect(p).toEqual({
      identity: 'p-1',
      name: 'mia',
      kind: 'guest',
      hand: true,
      handAt: '2026-10-19T10:00:00Z',
      speaker: false,
      isLocal: false,
    });
    expect(personOf({ identity: 'p-2', permissions: { canPublish: true } }, true)).toMatchObject({
      name: HIDDEN_LISTENER,
      speaker: true,
      isLocal: true,
    });
  });
});

describe('the audience', () => {
  it('orders raised hands first (earliest first), then names, hidden listeners last', () => {
    const list = [
      person(HIDDEN_LISTENER, { identity: 'p-h1' }),
      person('zoe'),
      person('bob', { hand: true, handAt: '2026-10-19T10:05:00Z' }),
      person('Anna'),
      person('carl', { hand: true, handAt: '2026-10-19T10:01:00Z' }),
    ];
    expect(audienceOrder(list).map((p) => p.name)).toEqual([
      'carl',
      'bob',
      'Anna',
      'zoe',
      HIDDEN_LISTENER,
    ]);
  });

  it('finds listeners by name, never hidden ones', () => {
    const list = [person('Anna'), person('hannah'), person(HIDDEN_LISTENER)];
    expect(findListeners(list, 'ANN').map((p) => p.name)).toEqual(['Anna', 'hannah']);
    expect(findListeners(list, 'listener')).toEqual([]);
    expect(findListeners(list, '  ')).toHaveLength(3);
  });
});

describe('the spotlight', () => {
  const speakers = [person('mia', { speaker: true }), person('olga', { speaker: true })];

  it('shows the speaker the server named, if they are on the stage now', () => {
    const meta = JSON.stringify({ spotlight: { identity: 'p-mia', by: 'share' } });
    expect(spotlightSpeaker(spotlightOf(meta), speakers).name).toBe('mia');
    const gone = JSON.stringify({ spotlight: { identity: 'p-ann', by: 'self' } });
    expect(spotlightSpeaker(spotlightOf(gone), speakers)).toBeNull();
  });

  it('falls back to all speakers without a choice, for "all speakers" and broken metadata', () => {
    const all = JSON.stringify({ spotlight: { identity: null, by: 'organiser' } });
    for (const meta of ['', 'not json', JSON.stringify({ spotlight: null }), all]) {
      expect(spotlightSpeaker(spotlightOf(meta), speakers)).toBeNull();
    }
  });
});

describe('a screen share without the spotlight', () => {
  const speakers = [person('mia', { speaker: true }), person('olga', { speaker: true })];

  it('is shown large when the server named nobody (or its update failed)', () => {
    expect(shownLarge(null, speakers, ['p-mia']).name).toBe('mia');
    expect(shownLarge(null, speakers, ['p-mia', 'p-olga']).name).toBe('olga');
    expect(shownLarge(null, speakers, [])).toBeNull();
  });

  it("gives way to the server's choice, and to an organiser's 'all speakers'", () => {
    const olga = { identity: 'p-olga', by: 'organiser' };
    expect(shownLarge(olga, speakers, ['p-mia']).name).toBe('olga');
    expect(shownLarge({ identity: null, by: 'organiser' }, speakers, ['p-mia'])).toBeNull();
  });
});

it('numbers hidden listeners, so every Invite button has its own name', () => {
  const names = listenerNames([
    person('bob'),
    person(HIDDEN_LISTENER, { identity: 'p-h1' }),
    person(HIDDEN_LISTENER, { identity: 'p-h2' }),
  ]);
  expect([...names.values()]).toEqual(['bob', 'listener 1', 'listener 2']);
});

describe('screen sharing without sound', () => {
  it('Chromium browsers: how to share with sound, and offer to share again', () => {
    expect(shareAudioNotice(false, true)).toEqual({ text: NO_SOUND_SHARED, reshare: true });
    expect(NO_SOUND_SHARED).toBe(
      "No sound is being shared. For sound, choose 'Entire screen' and tick 'Share system audio', or a browser tab with 'Share tab audio'."
    );
  });

  it('other browsers: the browser hint; no notice when there is sound', () => {
    expect(shareAudioNotice(false, false)).toEqual({ text: NO_SHARE_AUDIO, reshare: false });
    expect(NO_SHARE_AUDIO).toBe(
      "Your browser can't send sound with screen sharing — for presentations with sound use Chrome or Edge."
    );
    expect(shareAudioNotice(true, true)).toBeNull();
    expect(shareAudioNotice(true, false)).toBeNull();
  });

  it('tells Chrome and Edge from Firefox and Safari', () => {
    const ua = (userAgent) => isChromium({ userAgent });
    const win = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)';
    expect(ua(`${win} Chrome/141.0.0.0 Safari/537.36`)).toBe(true);
    expect(ua(`${win} Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0`)).toBe(true);
    expect(ua('Mozilla/5.0 (Windows NT 10.0; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe(false);
    expect(
      ua(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
      )
    ).toBe(false);
    expect(isChromium({ userAgent: '', userAgentData: { brands: [{ brand: 'Chromium' }] } })).toBe(
      true
    );
  });
});
