// ============================================================
// File:        changes.js
// Path:        server/src/polls/changes.js
// Project:     Seasonal Entertainment
// Description: The "polls" event to every signed-in member's open pages (docs/POLLS.md, "Live
//              updates"), at most one a second: the first change of a quiet moment opens a
//              one-second window, every change inside it is folded in, and the window's end
//              sends one event, so a burst of votes makes one reload per page and the last
//              change of a burst still arrives (security review of 2026-11-13, L4). One window
//              per chat handle, shared by every sender (routes.js, calls/endCall.js).
// ============================================================

export const WINDOW_MS = 1000;

const windows = new WeakMap();

// chat: mountChat's handle. Call it after every change of a poll.
export function pollsChanged(chat) {
  if (windows.has(chat)) return;
  const timer = setTimeout(() => {
    windows.delete(chat);
    chat.notify.members({ type: 'polls' });
  }, WINDOW_MS);
  // A window still open does not keep the process alive at shutdown.
  timer.unref?.();
  windows.set(chat, timer);
}
