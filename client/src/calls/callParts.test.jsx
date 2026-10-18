// ============================================================
// File:        callParts.test.jsx
// Path:        client/src/calls/callParts.test.jsx
// Project:     Seasonal Entertainment
// Description: The call page's parts without a call server: the listener list (hands first
//              and marked, guests tagged, "Find a listener", Invite for organisers only, never
//              for guests), the controls per role (guests have no hand; speakers get the
//              "use headphones" hint before sharing; only hosts end the call), and the stage
//              (all speakers, or the spotlight with "<name> is sharing the screen" and a sound
//              mark when the share carries audio).
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Audience from './Audience.jsx';
import CallControls from './CallControls.jsx';
import Stage from './Stage.jsx';
import { HEADPHONES_HINT, HIDDEN_LISTENER } from './stageModel.js';

const person = (name, extra = {}) => ({
  identity: `p-${name}`,
  name,
  kind: 'member',
  hand: false,
  handAt: '',
  speaker: false,
  isLocal: false,
  ...extra,
});

// A LiveKit-like room: participants with tracks by source ('camera', 'screen_share', ...).
const fakeTrack = () => ({ attach: vi.fn(), detach: vi.fn() });
function fakeRoom(tracksByIdentity) {
  const participant = (identity) => ({
    identity,
    getTrackPublication: (source) => {
      const track = tracksByIdentity[identity]?.[source];
      return track ? { track, isMuted: false } : undefined;
    },
  });
  const ids = Object.keys(tracksByIdentity);
  return {
    localParticipant: participant('p-me'),
    remoteParticipants: new Map(ids.map((id) => [id, participant(id)])),
  };
}

describe('the listener list', () => {
  const listeners = [
    person('zoe'),
    person(HIDDEN_LISTENER, { identity: 'p-h' }),
    person('bob', { hand: true, handAt: '2026-10-19T10:00:00Z' }),
    person('Guest-ab12cd', { kind: 'guest' }),
  ];

  it('puts raised hands first and marks them; tags guests; organisers invite members', () => {
    const onInvite = vi.fn();
    render(<Audience listeners={listeners} onInvite={onInvite} />);
    const list = screen.getByRole('region', { name: 'Listeners' });
    const names = within(list)
      .getAllByRole('listitem')
      .map((li) => li.querySelector('.audience-chip__name').textContent);
    expect(names).toEqual(['bob', 'Guest-ab12cd', 'zoe', HIDDEN_LISTENER]);
    expect(within(list).getByRole('img', { name: 'Hand raised' })).toBeInTheDocument();
    // Chips: an initial circle (a neutral one for hidden listeners); the raised hand marked.
    const [bob, , , hidden] = within(list).getAllByRole('listitem');
    expect(bob).toHaveClass('audience-chip--hand');
    expect(bob.querySelector('.audience-chip__initial')).toHaveTextContent('B');
    expect(hidden.querySelector('.audience-chip__initial--neutral svg')).not.toBeNull();
    // A compact button inside the chip, not a link-styled one.
    expect(within(bob).getByRole('button', { name: 'Invite bob to the stage' })).toHaveClass(
      'audience-chip__invite'
    );
    expect(within(list).getByText('Guest')).toBeInTheDocument();
    expect(within(list).getByText('4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Invite bob to the stage' }));
    expect(onInvite).toHaveBeenCalledWith('p-bob');
    expect(screen.queryByRole('button', { name: 'Invite Guest-ab12cd to the stage' })).toBeNull();
  });

  it('gives every hidden listener its own Invite name', () => {
    const hidden = (n) => person(HIDDEN_LISTENER, { identity: `p-h${n}` });
    const onInvite = vi.fn();
    render(<Audience listeners={[hidden(1), hidden(2), person('ann')]} onInvite={onInvite} />);
    fireEvent.click(screen.getByRole('button', { name: 'Invite listener 2 to the stage' }));
    expect(onInvite).toHaveBeenCalledWith('p-h2');
    expect(
      screen.getByRole('button', { name: 'Invite listener 1 to the stage' })
    ).toBeInTheDocument();
  });

  it('finds a listener by name; nobody else may invite', () => {
    render(<Audience listeners={listeners} onInvite={null} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a listener' }), {
      target: { value: 'ZO' },
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^Invite/ })).toBeNull();
    // The site's search field look, not the browser's grey default.
    expect(screen.getByRole('searchbox', { name: 'Find a listener' })).toHaveClass('search-input');
  });
});

describe('the controls', () => {
  const local = { isMicrophoneEnabled: false, isCameraEnabled: false, isScreenShareEnabled: false };
  const controls = () => ({
    toggleMicrophone: vi.fn(),
    toggleCamera: vi.fn(),
    toggleShare: vi.fn(),
    leaveStage: vi.fn(),
    raiseHand: vi.fn(),
    endCall: vi.fn(),
    leave: vi.fn(),
  });
  const names = () => screen.getAllByRole('button').map((b) => b.textContent);

  it('member listeners raise a hand; guests have none', () => {
    const c = controls();
    const { unmount } = render(
      <CallControls me={person('mia')} local={local} host={false} controls={c} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Raise hand' }));
    expect(c.raiseHand).toHaveBeenCalledWith(true);
    expect(names()).toEqual(['Raise hand', 'Leave call']);
    unmount();
    render(
      <CallControls me={person('g', { kind: 'guest' })} local={local} host={false} controls={c} />
    );
    expect(names()).toEqual(['Leave call']);
  });

  it('speakers get the headphones hint before sharing; hosts end the call', () => {
    const c = controls();
    render(<CallControls me={person('olga', { speaker: true })} local={local} host controls={c} />);
    expect(names()).toEqual([
      'Microphone',
      'Camera',
      'Share screen',
      'Leave the stage',
      'End call for everyone',
      'Leave call',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Share screen' }));
    expect(c.toggleShare).not.toHaveBeenCalled();
    const ask = screen.getByRole('group', { name: 'Share your screen' });
    expect(ask).toHaveTextContent(HEADPHONES_HINT);
    fireEvent.click(within(ask).getByRole('button', { name: 'Share now' }));
    expect(c.toggleShare).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'End call for everyone' }));
    expect(c.endCall).toHaveBeenCalledOnce();
  });
});

describe('the stage', () => {
  const speakers = [
    person('mia', { speaker: true }),
    person('olga', { speaker: true, kind: 'host' }),
  ];
  const stage = (room, spotlight) =>
    render(
      <Stage
        speakers={speakers}
        room={room}
        spotlight={spotlight}
        talking={new Set(['p-olga'])}
        tileActions={() => null}
        onAllSpeakers={null}
      />
    );

  it('shows all speakers without a spotlight, the talking one marked', () => {
    stage(fakeRoom({ 'p-mia': {}, 'p-olga': {} }), null);
    const tiles = within(screen.getByRole('region', { name: 'Stage' })).getAllByRole('listitem');
    expect(tiles.map((t) => t.getAttribute('aria-label'))).toEqual([
      'mia, speaker',
      'olga, host, talking',
    ]);
  });

  it('puts a sharing presenter large, camera inset, with a sound mark for shared audio', () => {
    const room = fakeRoom({
      'p-mia': { screen_share: fakeTrack(), camera: fakeTrack(), screen_share_audio: fakeTrack() },
      'p-olga': {},
    });
    stage(room, { identity: 'p-mia', by: 'share' });
    expect(screen.getByText('mia is sharing the screen')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'with sound' })).toBeInTheDocument();
    expect(screen.getByLabelText("mia's screen")).toBeInTheDocument();
    expect(screen.getByLabelText("mia's camera")).toHaveClass('stage-spotlight__inset');
    expect(
      within(screen.getByRole('list', { name: 'Other speakers' })).getAllByRole('listitem')
    ).toHaveLength(1);
  });

  it('shows a screen share large even without a spotlight (its update failed)', () => {
    stage(
      fakeRoom({ 'p-mia': { screen_share: fakeTrack(), camera: fakeTrack() }, 'p-olga': {} }),
      null
    );
    expect(screen.getByText('mia is sharing the screen')).toBeInTheDocument();
    expect(screen.getByLabelText("mia's screen")).toBeInTheDocument();
  });

  it("shows a share in its speaker's tile when an organiser chose all speakers", () => {
    // With a camera on as well: the screen is what the tile plays.
    const [shared, camera] = [fakeTrack(), fakeTrack()];
    stage(fakeRoom({ 'p-mia': { screen_share: shared, camera }, 'p-olga': {} }), {
      identity: null,
      by: 'organiser',
    });
    expect(screen.queryByText('mia is sharing the screen')).toBeNull();
    const tile = screen.getByRole('listitem', { name: 'mia, speaker' });
    expect(within(tile).getByLabelText("mia's screen")).toBeInTheDocument();
    expect(shared.attach).toHaveBeenCalled();
    expect(camera.attach).not.toHaveBeenCalled();
  });

  it('shows no sound mark when the share has none', () => {
    stage(fakeRoom({ 'p-mia': { screen_share: fakeTrack() }, 'p-olga': {} }), {
      identity: 'p-mia',
      by: 'share',
    });
    expect(screen.getByText('mia is sharing the screen')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'with sound' })).toBeNull();
  });
});
