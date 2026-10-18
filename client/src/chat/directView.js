// ============================================================
// File:        directView.js
// Path:        client/src/chat/directView.js
// Project:     Seasonal Entertainment
// Description: Which direct conversation is shown (one per page), and requests to open one:
//              "Send private message" in a name menu asks for a partner, the direct view shows
//              that conversation, and a host (the chat drawer, the full chat page) hears the
//              request through onDirectRequest() to bring its Direct tab forward.
// ============================================================

import { useSyncExternalStore } from 'react';

let partner = null; // { id, username } or null for the conversation list
const listeners = new Set();
const requestListeners = new Set();

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useDirectPartner = () => useSyncExternalStore(subscribe, () => partner);

// The list (null) or one conversation, chosen inside the direct view.
export function showDirect(next) {
  partner = next;
  listeners.forEach((listener) => listener());
}

// From outside the direct view (a name menu): show that conversation and tell the hosts.
export function requestDirect(next) {
  showDirect(next);
  requestListeners.forEach((callback) => callback(next));
}

// callback(partner) on every request; returns the function that stops listening.
export function onDirectRequest(callback) {
  requestListeners.add(callback);
  return () => requestListeners.delete(callback);
}
