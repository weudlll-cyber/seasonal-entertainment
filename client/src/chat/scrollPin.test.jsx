// ============================================================
// File:        scrollPin.test.jsx
// Path:        client/src/chat/scrollPin.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards useScrollPin's answer to content that grows after it arrived: any message
//              of the list (not only the newest: a direct message's picture decrypts after the
//              text below it arrived) is watched, and its growth keeps a pinned reader at the
//              bottom, also when the scroll event of the pin's own jump arrives only after the
//              content grew. jsdom has no ResizeObserver: a stand-in records what is watched.
// ============================================================

import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useScrollPin } from './useScrollPin.js';

let observers;
beforeEach(() => {
  observers = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback) {
        this.callback = callback;
        this.watched = new Set();
        observers.push(this);
      }
      observe(element) {
        this.watched.add(element);
      }
      disconnect() {
        this.watched.clear();
      }
    }
  );
});
afterEach(() => vi.unstubAllGlobals());

function List({ messages }) {
  const list = useRef(null);
  const { onScroll } = useScrollPin(list, 'room', messages);
  return (
    <ol ref={list} aria-label="Messages" onScroll={onScroll}>
      {messages.map((m) => (
        <li key={m.id}>{m.text}</li>
      ))}
    </ol>
  );
}

it('every message is watched; one growing above the newest keeps the reader at the bottom', () => {
  const messages = [
    { id: 1, text: 'picture' },
    { id: 2, text: 'text' },
  ];
  render(<List messages={messages} />);
  const list = screen.getByRole('list', { name: 'Messages' });
  const active = observers.find((o) => o.watched.size > 0);
  const [first, newest] = list.children;
  expect(active.watched.has(first)).toBe(true);
  expect(active.watched.has(newest)).toBe(true);
  // The picture in the first message decrypts: the list grows to 900px.
  Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 900 });
  act(() => active.callback([{ target: first }]));
  expect(list.scrollTop).toBe(900);
});

it("the pin's own jump does not unpin the reader when its scroll event comes late", () => {
  render(
    <List
      messages={[
        { id: 1, text: 'picture' },
        { id: 2, text: 'file' },
      ]}
    />
  );
  const list = screen.getByRole('list', { name: 'Messages' });
  const active = observers.find((o) => o.watched.size > 0);
  // As a browser does: scrollTop stops at scrollHeight - clientHeight.
  let height = 500;
  let top = 0;
  Object.defineProperty(list, 'clientHeight', { configurable: true, value: 450 });
  Object.defineProperty(list, 'scrollHeight', { configurable: true, get: () => height });
  Object.defineProperty(list, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (value) => {
      top = Math.min(value, height - 450);
    },
  });
  act(() => active.callback([{ target: list.children[1] }])); // the pin jumps to the end: 50
  // The picture grows before the browser reports that jump's scroll event.
  height = 750;
  fireEvent.scroll(list);
  act(() => active.callback([{ target: list.children[0] }]));
  expect(list.scrollTop).toBe(300);
});
