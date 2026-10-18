// ============================================================
// File:        stageModel.test.js
// Path:        client/src/calls/stageModel.test.js
// Project:     Seasonal Entertainment
// Description: The call page's rules (stageModel.js): people from LiveKit participants,
//              audience order (hands first by time, then names, hidden listeners last), finding
//              listeners (hidden ones never by name), the spotlight from the room metadata
//              (only a speaker on the stage now), and the no-sound notice for screen sharing.
// ============================================================

import { describe, expect, it } from 'vitest';
import {
  HIDDEN_LISTENER,
  NO_SHARE_AUDIO,
  audienceOrder,
  findListeners,
  personOf,
  shareAudioNotice,
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

it('tells a presenter when their screen share carries no sound', () => {
  expect(shareAudioNotice(false)).toBe(NO_SHARE_AUDIO);
  expect(NO_SHARE_AUDIO).toBe(
    "Your browser can't send sound with screen sharing — for presentations with sound use Chrome or Edge."
  );
  expect(shareAudioNotice(true)).toBeNull();
});
