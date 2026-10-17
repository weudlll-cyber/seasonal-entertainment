// ============================================================
// File:        requestLog.js
// Path:        client/e2e/requestLog.js
// Project:     Seasonal Entertainment
// Description: Records every request a page sends (URL and body) and every WebSocket frame,
//              so a spec can prove that a typed secret never left the browser in any of them.
// ============================================================

// Returns { text() }: everything sent so far as one string.
export function recordRequests(page) {
  const sent = [];
  page.on('request', (request) => sent.push(`${request.url()}\n${request.postData() ?? ''}`));
  page.on('websocket', (socket) => socket.on('framesent', (frame) => sent.push(frame.payload)));
  return { text: () => sent.join('\n') };
}
