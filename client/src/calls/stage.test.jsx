// ============================================================
// File:        stage.test.jsx
// Path:        client/src/calls/stage.test.jsx
// Project:     Seasonal Entertainment
// Description: The call stage without a call server: all speakers (the talking one marked),
//              or one large — a sharing presenter (screen letterboxed, never cropped; camera
//              inset), also without a spotlight; the chips over the stage ("<name> is sharing
//              the screen" with a sound mark for shared audio, "Show all speakers" for
//              organisers, a speaker's own spotlight switch); organisers' "…" menu on other
//              speakers; the full-screen button (hidden without the Fullscreen API).
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Stage from './Stage.jsx';
import { fakeRoom, fakeTrack, person } from './testRoom.js';

const speakers = [
  person('mia', { speaker: true }),
  person('olga', { speaker: true, kind: 'host' }),
];
const stage = (room, spotlight, extra = {}) =>
  render(
    <Stage
      speakers={speakers}
      room={room}
      spotlight={spotlight}
      talking={new Set(['p-olga'])}
      me={speakers[1]}
      tileMenu={() => null}
      onAllSpeakers={null}
      onHighlightSelf={null}
      {...extra}
    />
  );
const sharing = () =>
  fakeRoom({
    'p-mia': { screen_share: fakeTrack(), camera: fakeTrack(), screen_share_audio: fakeTrack() },
    'p-olga': {},
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cameras', () => {
  it('a lone speaker fills the stage, the camera never cropped', () => {
    render(
      <Stage
        speakers={[speakers[0]]}
        room={fakeRoom({ 'p-mia': { camera: fakeTrack() } })}
        spotlight={null}
        talking={new Set()}
        me={speakers[0]}
        tileMenu={() => null}
        onAllSpeakers={null}
        onHighlightSelf={null}
      />
    );
    expect(screen.getByLabelText("mia's camera")).toHaveClass('track-video--contain');
    expect(screen.getByRole('listitem')).toHaveClass('speaker-tile--large');
  });

  it("in a grid each picture takes its camera's shape (16:9 until known), filled", () => {
    const room = fakeRoom({ 'p-mia': { camera: fakeTrack() }, 'p-olga': { camera: fakeTrack() } });
    // olga's camera is known to be 4:3.
    const olga = room.remoteParticipants.get('p-olga');
    const plain = olga.getTrackPublication;
    olga.getTrackPublication = (source) => ({
      ...plain(source),
      dimensions: { width: 640, height: 480 },
    });
    stage(room, null);
    expect(screen.getByLabelText("mia's camera")).toHaveClass('track-video--cover');
    const ratio = (name) =>
      Number(screen.getByLabelText(name).parentElement.style.aspectRatio.split('/')[0]);
    expect(ratio("mia's camera")).toBeCloseTo(16 / 9);
    expect(ratio("olga's camera")).toBeCloseTo(4 / 3);
  });
});

describe('layouts', () => {
  it('shows all speakers without a spotlight, the talking one marked', () => {
    stage(fakeRoom({ 'p-mia': {}, 'p-olga': {} }), null);
    const tiles = within(screen.getByRole('region', { name: 'Stage' })).getAllByRole('listitem');
    expect(tiles.map((t) => t.getAttribute('aria-label'))).toEqual([
      'mia, speaker',
      'olga, host, talking',
    ]);
  });

  it('puts a sharing presenter large: screen never cropped, camera inset, sound mark', () => {
    stage(sharing(), { identity: 'p-mia', by: 'share' });
    expect(screen.getByText('mia is sharing the screen')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'with sound' })).toBeInTheDocument();
    expect(screen.getByLabelText("mia's screen")).toHaveClass('track-video--contain');
    expect(screen.getByLabelText("mia's camera")).toHaveClass('stage-spotlight__inset');
    expect(
      within(screen.getByRole('list', { name: 'Other speakers' })).getAllByRole('listitem')
    ).toHaveLength(1);
  });

  it('shows a share large even without a spotlight (its update failed)', () => {
    stage(sharing(), null);
    expect(screen.getByText('mia is sharing the screen')).toBeInTheDocument();
  });

  it("plays a share in its speaker's tile, uncropped, when an organiser chose all speakers", () => {
    const [shared, camera] = [fakeTrack(), fakeTrack()];
    stage(fakeRoom({ 'p-mia': { screen_share: shared, camera }, 'p-olga': {} }), {
      identity: null,
      by: 'organiser',
    });
    expect(screen.queryByText('mia is sharing the screen')).toBeNull();
    const tile = screen.getByRole('listitem', { name: 'mia, speaker' });
    expect(within(tile).getByLabelText("mia's screen")).toHaveClass('track-video--contain');
    expect(shared.attach).toHaveBeenCalled();
    expect(camera.attach).not.toHaveBeenCalled();
  });

  it('shows no sound mark when the share has none', () => {
    stage(fakeRoom({ 'p-mia': { screen_share: fakeTrack() }, 'p-olga': {} }), {
      identity: 'p-mia',
      by: 'share',
    });
    expect(screen.queryByRole('img', { name: 'with sound' })).toBeNull();
  });
});

describe('chips and menus', () => {
  it('organisers return to all speakers; speakers switch their own spotlight', () => {
    const onAllSpeakers = vi.fn();
    const onHighlightSelf = vi.fn();
    stage(sharing(), { identity: 'p-mia', by: 'share' }, { onAllSpeakers, onHighlightSelf });
    fireEvent.click(screen.getByRole('button', { name: 'Show all speakers' }));
    expect(onAllSpeakers).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Put me in the spotlight' }));
    expect(onHighlightSelf).toHaveBeenCalledWith(true);
  });

  it('organisers\' "…" menu on a speaker: Spotlight, Mute, Remove (asks first)', () => {
    const run = vi.fn();
    const tileMenu = (p) =>
      p.identity === 'p-mia'
        ? [
            { label: 'Spotlight', run },
            {
              label: 'Remove from the stage',
              run,
              confirm: { question: 'Take mia off the stage?', action: 'Remove' },
            },
          ]
        : null;
    stage(fakeRoom({ 'p-mia': {}, 'p-olga': {} }), null, { tileMenu });
    expect(screen.queryByRole('button', { name: 'Actions for olga' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for mia' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from the stage' }));
    expect(run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(run).toHaveBeenCalledOnce();
  });
});

describe('full screen', () => {
  it('puts the stage into the browser full screen', () => {
    // jsdom has no Fullscreen API: give the page one.
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
    const request = vi.fn(() => Promise.resolve());
    HTMLElement.prototype.requestFullscreen = request;
    stage(sharing(), { identity: 'p-mia', by: 'share' });
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.contexts[0]).toBe(screen.getByRole('region', { name: 'Stage' }));
    delete HTMLElement.prototype.requestFullscreen;
    delete document.fullscreenEnabled;
  });

  it('is not offered without the Fullscreen API', () => {
    stage(sharing(), { identity: 'p-mia', by: 'share' });
    expect(screen.queryByRole('button', { name: 'Full screen' })).toBeNull();
  });
});
