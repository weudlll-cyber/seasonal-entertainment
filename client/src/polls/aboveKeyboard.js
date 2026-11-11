// ============================================================
// File:        aboveKeyboard.js
// Path:        client/src/polls/aboveKeyboard.js
// Project:     Seasonal Entertainment
// Description: Keeps a poll's text field and its submit button above a phone's on-screen
//              keyboard (PollVote.jsx; docs/POLLS.md, "On a phone"): the keyboard shrinks the
//              visual viewport, not the page, so a button under the field can end up behind it.
//              While the field has focus, every change of the visual viewport (the keyboard
//              opening, the page scrolling) moves the page just enough that the button's
//              bottom edge is visible again. Where the browser has no visualViewport, nothing.
// ============================================================

const GAP = 8; // px left between the button and the keyboard

// field: the focused text field; button: the submit button below it. Returns the function
// that stops following (on blur).
export function keepAboveKeyboard(field, button) {
  const view = window.visualViewport;
  if (!view || !button) return () => {};
  const follow = () => {
    const bottom = button.getBoundingClientRect().bottom;
    const visibleBottom = view.offsetTop + view.height;
    if (bottom > visibleBottom - GAP) window.scrollBy(0, bottom - visibleBottom + GAP);
    // The field itself stays in sight above it.
    const top = field.getBoundingClientRect().top;
    if (top < view.offsetTop) window.scrollBy(0, top - view.offsetTop - GAP);
  };
  view.addEventListener('resize', follow);
  follow();
  return () => view.removeEventListener('resize', follow);
}
