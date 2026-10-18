// ============================================================
// File:        callParts.test.jsx
// Path:        client/src/calls/callParts.test.jsx
// Project:     Seasonal Entertainment
// Description: The call page's listener panel and control bar without a call server. The
//              panel: collapsed to one row by default (every raised hand shown, "+N", a button
//              to show all), expanded with "Find a listener" and the whole list; chips (initial
//              circle, neutral for hidden listeners, raised hand marked, guests tagged);
//              Invite for organisers only, never for guests, with its own name for every hidden
//              listener. The bar: round icon buttons named and with tooltips; each toggle names
//              what a click will do and its icon shows the state (sharing, microphone, camera);
//              guests have no hand; speakers get the "use headphones" hint before sharing; only
//              hosts end the call, and it asks first.
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Audience from './Audience.jsx';
import CallControls from './CallControls.jsx';
import { HEADPHONES_HINT, HIDDEN_LISTENER } from './stageModel.js';
import { person } from './testRoom.js';

describe('the listener panel', () => {
  const listeners = [
    person('zoe'),
    person(HIDDEN_LISTENER, { identity: 'p-h' }),
    person('bob', { hand: true, handAt: '2026-10-19T10:00:00Z' }),
    person('Guest-ab12cd', { kind: 'guest' }),
  ];
  const chipNames = (list) =>
    within(list)
      .getAllByRole('listitem')
      .map((li) => li.querySelector('.audience-chip__name')?.textContent ?? li.textContent);

  it('chips: hands first and marked, guests tagged, organisers invite members', () => {
    const onInvite = vi.fn();
    render(<Audience listeners={listeners} onInvite={onInvite} />);
    const list = screen.getByRole('region', { name: 'Listeners' });
    expect(chipNames(list)).toEqual(['bob', 'Guest-ab12cd', 'zoe', HIDDEN_LISTENER]);
    expect(within(list).getByRole('img', { name: 'Hand raised' })).toBeInTheDocument();
    expect(within(list).getByText('Guest')).toBeInTheDocument();
    expect(within(list).getByText('4')).toBeInTheDocument();
    const [bob, , , hidden] = within(list).getAllByRole('listitem');
    expect(bob).toHaveClass('audience-chip--hand');
    expect(bob.querySelector('.audience-chip__initial')).toHaveTextContent('B');
    expect(hidden.querySelector('.audience-chip__initial--neutral svg')).not.toBeNull();
    const invite = within(bob).getByRole('button', { name: 'Invite bob to the stage' });
    expect(invite).toHaveClass('audience-chip__invite');
    fireEvent.click(invite);
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

  it('is one row when collapsed — every raised hand shown — and opens to search and all', () => {
    const many = Array.from({ length: 9 }, (_, i) => person(`member${i}`));
    many.push(person('late', { hand: true, handAt: '2026-10-19T11:00:00Z' }));
    render(<Audience listeners={many} onInvite={null} />);
    const list = screen.getByRole('region', { name: 'Listeners' });
    // The raised hand is in the collapsed row (first), the rest counted as "+N".
    expect(chipNames(list)[0]).toBe('late');
    expect(chipNames(list)).toHaveLength(4);
    expect(within(list).getByLabelText('6 more listeners')).toHaveTextContent('+6');
    expect(screen.queryByRole('searchbox')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Show all listeners' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    const search = screen.getByRole('searchbox', { name: 'Find a listener' });
    expect(search).toHaveClass('search-input');
    expect(within(list).getAllByRole('listitem')).toHaveLength(10);
    fireEvent.change(search, { target: { value: 'MEMBER3' } });
    expect(chipNames(list)).toEqual(['member3']);
    expect(screen.queryByRole('button', { name: /^Invite/ })).toBeNull();
  });
});

describe('the control bar', () => {
  const local = { isMicrophoneEnabled: false, isCameraEnabled: true, isScreenShareEnabled: false };
  const controls = () => ({
    toggleMicrophone: vi.fn(),
    toggleCamera: vi.fn(),
    toggleShare: vi.fn(),
    leaveStage: vi.fn(),
    raiseHand: vi.fn(),
    endCall: vi.fn(),
    leave: vi.fn(),
  });
  const names = () => screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));

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

  it('speakers: round icon buttons with tooltips; the hint before sharing; hosts end, asked', () => {
    const c = controls();
    render(<CallControls me={person('olga', { speaker: true })} local={local} host controls={c} />);
    expect(names()).toEqual([
      'Unmute microphone',
      'Turn camera off',
      'Share screen',
      'Leave the stage',
      'End call for everyone',
      'Leave call',
    ]);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('data-tooltip', button.getAttribute('aria-label'));
      expect(button.textContent).toBe('');
    }

    fireEvent.click(screen.getByRole('button', { name: 'Share screen' }));
    expect(c.toggleShare).not.toHaveBeenCalled();
    const ask = screen.getByRole('group', { name: 'Share your screen' });
    expect(ask).toHaveTextContent(HEADPHONES_HINT);
    fireEvent.click(within(ask).getByRole('button', { name: 'Share now' }));
    expect(c.toggleShare).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'End call for everyone' }));
    expect(c.endCall).not.toHaveBeenCalled();
    const end = screen.getByRole('group', { name: 'End the call for everyone' });
    fireEvent.click(within(end).getByRole('button', { name: 'End call' }));
    expect(c.endCall).toHaveBeenCalledOnce();
  });

  // [state, name a click means, icon, red/active class or null, aria-pressed]
  const TOGGLES = {
    microphone: [
      [{ isMicrophoneEnabled: true }, 'Mute microphone', 'mic', null, 'true'],
      [{ isMicrophoneEnabled: false }, 'Unmute microphone', 'micOff', 'call-control--off', 'false'],
    ],
    camera: [
      [{ isCameraEnabled: true }, 'Turn camera off', 'camera', null, 'true'],
      [{ isCameraEnabled: false }, 'Turn camera on', 'cameraOff', 'call-control--off', 'false'],
    ],
    share: [
      [{ isScreenShareEnabled: false }, 'Share screen', 'screen', null, 'false'],
      [{ isScreenShareEnabled: true }, 'Stop sharing', 'screenOff', 'call-control--on', 'true'],
    ],
  };
  for (const [toggle, states] of Object.entries(TOGGLES)) {
    it(`the ${toggle} button says what a click does and shows the state`, () => {
      for (const [state, name, icon, marked, pressed] of states) {
        const { unmount } = render(
          <CallControls
            me={person('olga', { speaker: true })}
            local={{ ...local, ...state }}
            host={false}
            controls={controls()}
          />
        );
        const button = screen.getByRole('button', { name });
        expect(button).toHaveAttribute('data-tooltip', name);
        expect(button).toHaveAttribute('aria-pressed', pressed);
        expect(button.querySelector('svg').dataset.icon).toBe(icon);
        if (marked) expect(button).toHaveClass(marked);
        else expect(button.className).toBe('call-control');
        unmount();
      }
    });
  }
});
