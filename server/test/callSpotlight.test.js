// ============================================================
// File:        callSpotlight.test.js
// Path:        server/test/callSpotlight.test.js
// Project:     Seasonal Entertainment
// Description: The spotlight (docs/CALLS.md, "Spotlight"): the rule itself (newest screen
//              share wins; self-highlight unless an organiser's choice stands; an organiser's
//              choice stands until changed; stopping a share or leaving releases one's own
//              spotlight) and the routes that apply it — organisers only for choosing,
//              speakers only for themselves, every change set as the room's metadata.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { nextSpotlight } from '../src/calls/spotlight.js';
import { callApp, join, liveCall, organiser } from './helpers/calls.js';
import { registerUser } from './helpers/testApp.js';

describe('the rule', () => {
  const by = (identity, how) => ({ identity, by: how });

  it('a screen share takes the spotlight; the newest share wins', () => {
    expect(nextSpotlight(null, { type: 'share', identity: 'a', sharing: true }).state).toEqual(
      by('a', 'share')
    );
    expect(
      nextSpotlight(by('a', 'share'), { type: 'share', identity: 'b', sharing: true }).state
    ).toEqual(by('b', 'share'));
    // Even over an organiser's choice.
    expect(
      nextSpotlight(by('c', 'organiser'), { type: 'share', identity: 'b', sharing: true }).state
    ).toEqual(by('b', 'share'));
  });

  it("stopping a share releases only one's own spotlight", () => {
    const shared = by('a', 'share');
    expect(
      nextSpotlight(shared, { type: 'share', identity: 'a', sharing: false }).state
    ).toBeNull();
    expect(nextSpotlight(shared, { type: 'share', identity: 'b', sharing: false }).state).toBe(
      shared
    );
  });

  it('a speaker highlights themselves unless an organiser chose', () => {
    expect(nextSpotlight(null, { type: 'self', identity: 'a', on: true }).state).toEqual(
      by('a', 'self')
    );
    expect(nextSpotlight(by('b', 'organiser'), { type: 'self', identity: 'a', on: true })).toEqual({
      refused: 'organiser_choice',
    });
    // "All speakers" chosen by an organiser stands too.
    expect(
      nextSpotlight(by(null, 'organiser'), { type: 'self', identity: 'a', on: true }).refused
    ).toBe('organiser_choice');
    expect(
      nextSpotlight(by('a', 'self'), { type: 'self', identity: 'a', on: false }).state
    ).toBeNull();
    expect(
      nextSpotlight(by('b', 'self'), { type: 'self', identity: 'a', on: false }).state
    ).toEqual(by('b', 'self'));
  });

  it('an organiser overrides a self-highlight; leaving the stage releases it', () => {
    expect(nextSpotlight(by('a', 'self'), { type: 'organiser', identity: 'b' }).state).toEqual(
      by('b', 'organiser')
    );
    expect(nextSpotlight(by('a', 'organiser'), { type: 'left', identity: 'a' }).state).toBeNull();
    expect(nextSpotlight(by('a', 'share'), { type: 'left', identity: 'b' }).state).toEqual(
      by('a', 'share')
    );
  });
});

describe('the routes', () => {
  let t;
  let service;
  afterEach(() => t.close());

  // A live call: organiser olga on the stage, member mia invited to the stage, member ann
  // listening.
  async function setUp() {
    ({ t, service } = callApp());
    const olga = await organiser(t);
    const call = await liveCall(olga);
    const host = await join(olga, service, call);
    const mia = await registerUser(t, 'mia');
    const miaIn = await join(mia.agent, service, call);
    await olga.post(`/api/calls/${call.id}/stage/${miaIn.identity}`);
    const ann = await registerUser(t, 'ann');
    const annIn = await join(ann.agent, service, call);
    return { olga, call, host, mia, miaIn, ann, annIn };
  }
  const metadata = () => service.log.filter(([kind]) => kind === 'metadata').at(-1)?.[1];

  it('a share and a self-highlight set the room metadata; an organiser overrides', async () => {
    const { olga, call, mia, miaIn, host } = await setUp();
    const url = `/api/calls/${call.id}/spotlight`;
    await mia.agent.post(`${url}/self`).send({ on: true });
    expect(metadata()).toEqual({
      recording: false,
      spotlight: { identity: miaIn.identity, by: 'self' },
    });

    await olga.put(url).send({ identity: host.identity });
    expect(metadata()).toEqual({
      recording: false,
      spotlight: { identity: host.identity, by: 'organiser' },
    });
    const refused = await mia.agent.post(`${url}/self`).send({ on: true });
    expect([refused.status, refused.body.error]).toEqual([409, 'organiser_choice']);

    await mia.agent.post(`${url}/share`).send({ sharing: true });
    expect(metadata()).toEqual({
      recording: false,
      spotlight: { identity: miaIn.identity, by: 'share' },
    });
    await mia.agent.post(`${url}/share`).send({ sharing: false });
    expect(metadata()).toEqual({ recording: false, spotlight: null });

    await olga.put(url).send({ identity: null });
    expect(metadata()).toEqual({
      recording: false,
      spotlight: { identity: null, by: 'organiser' },
    });
  });

  it('only organisers choose; only speakers highlight themselves or report a share', async () => {
    const { call, mia, ann, annIn } = await setUp();
    const url = `/api/calls/${call.id}/spotlight`;
    expect((await mia.agent.put(url).send({ identity: null })).status).toBe(403);
    expect((await ann.agent.post(`${url}/self`).send({ on: true })).status).toBe(403);
    expect((await ann.agent.post(`${url}/share`).send({ sharing: true })).status).toBe(403);
    expect((await t.client().post(`${url}/share`).send({ sharing: true })).status).toBe(401);
    expect(metadata()).toBeUndefined();
    // An organiser cannot highlight a listener either.
    const olga = await organiser(t, 'otto');
    expect((await olga.put(url).send({ identity: annIn.identity })).body.error).toBe(
      'not_a_speaker'
    );
  });

  it('taking a highlighted speaker off the stage releases the spotlight', async () => {
    const { olga, call, mia, miaIn } = await setUp();
    await mia.agent.post(`/api/calls/${call.id}/spotlight/share`).send({ sharing: true });
    await olga.delete(`/api/calls/${call.id}/stage/${miaIn.identity}`);
    expect(metadata()).toEqual({ recording: false, spotlight: null });
  });
});
