// ============================================================
// File:        fakeSocket.js
// Path:        client/src/test/fakeSocket.js
// Project:     Seasonal Entertainment
// Description: Test helper: a stand-in for the browser's WebSocket. Records every socket made
//              (FakeSocket.all), what each sent, and whether it was closed; opens on the next
//              timer tick like a real one; push() delivers a server event to the page.
//              Install with vi.stubGlobal('WebSocket', FakeSocket) after FakeSocket.reset().
// ============================================================

import { act } from '@testing-library/react';

export class FakeSocket {
  static all = [];

  static reset() {
    FakeSocket.all = [];
  }

  constructor(url) {
    this.url = url;
    this.sent = [];
    this.readyState = 0;
    this.closed = false;
    FakeSocket.all.push(this);
    setTimeout(() => {
      if (this.closed) return;
      this.readyState = 1;
      this.onopen?.();
    });
  }

  send(data) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.closed = true;
    this.readyState = 3;
    this.onclose?.();
  }

  push(event) {
    act(() => this.onmessage?.({ data: JSON.stringify(event) }));
  }
}
