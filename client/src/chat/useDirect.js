// ============================================================
// File:        useDirect.js
// Path:        client/src/chat/useDirect.js
// Project:     Seasonal Entertainment
// Description: Data of the direct-message views (docs/CHAT.md, "Direct messages"): the
//              conversation list (favourite members first, then the most recent, each with an
//              unread mark), and one conversation — loaded, decrypted in the browser with the
//              member's private key, kept live, marked read, and sending (encrypted for the
//              partner's current key; once more when a key changed meanwhile).
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../api/http.js';
import { useFavourites } from './favourites.js';
import { usePersonalEvents } from './usePersonalEvents.js';

const crypto = () => import('@seasonal-entertainment/shared/crypto.js');

// Favourites first, then everyone else; within each, the most recent conversation first.
export function sortConversations(list) {
  const recent = (a, b) =>
    (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '') ||
    a.partner.username.localeCompare(b.partner.username);
  return [
    ...list.filter((c) => c.favourite).sort(recent),
    ...list.filter((c) => !c.favourite).sort(recent),
  ];
}

// Re-runs `load` whenever a direct message arrives for this member.
function useDirectEvents(load) {
  const onEvent = useCallback((event) => event.type === 'direct' && load(), [load]);
  usePersonalEvents(onEvent);
}

// Loaded again when a message arrives and when the favourite members change (a star here or
// in a name menu): favourites are listed first, and favourites without messages are listed.
export function useDirectConversations() {
  const favouriteIds = useFavourites()
    .users.map((u) => u.id)
    .join(',');
  const [conversations, setConversations] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(
    () =>
      api('/chat/direct')
        .then((data) => setConversations(sortConversations(data.conversations)))
        .catch((err) => setError(err.message)),
    []
  );
  useEffect(() => {
    load();
  }, [load, favouriteIds]);
  useDirectEvents(load);
  return { conversations, error };
}

// Each message with its payload ({ text, mediaItemId? }) or null when it does not open with
// this key (made for an earlier key of either member), and the partner's key id.
async function decryptAll(data, partnerId, key) {
  const { decryptDirect } = await crypto();
  return Promise.all(
    data.messages.map(async (m) => {
      const fromPartner = m.senderId === partnerId;
      const partnerKeyId = fromPartner ? m.senderKeyId : m.recipientKeyId;
      const myKeyId = fromPartner ? m.recipientKeyId : m.senderKeyId;
      const payload =
        myKeyId === key.keyId
          ? await decryptDirect(m, data.keys[partnerKeyId], key.privateKey)
          : null;
      return { ...m, fromPartner, partnerKeyId, payload };
    })
  );
}

// keyId, privateKey: the signed-in member's current key (keys/). Returns { data, messages,
// error, send, report }.
export function useDirectConversation(partnerId, keyId, privateKey) {
  const [state, setState] = useState({ data: null, messages: [] });
  const [error, setError] = useState(null);
  const readUpTo = useRef(0);

  const load = useCallback(async () => {
    try {
      const data = await api(`/chat/direct/${partnerId}`);
      const messages = await decryptAll(data, partnerId, { keyId, privateKey });
      setState({ data, messages });
      // Read now: the newest message from the partner is the read marker.
      const last = messages.filter((m) => m.fromPartner).at(-1);
      if (last && last.id > readUpTo.current) {
        readUpTo.current = last.id;
        await api(`/chat/direct/${partnerId}/read`, { method: 'POST', body: { lastId: last.id } });
      }
    } catch (err) {
      setError(err.message);
    }
  }, [partnerId, keyId, privateKey]);

  useEffect(() => {
    load();
  }, [load]);
  useDirectEvents(load);

  // payload: { text, mediaItemId? }. true when sent.
  async function send(payload, partnerKey = state.data?.partnerKey, retry = true) {
    setError(null);
    try {
      const { encryptDirect } = await crypto();
      const box = await encryptDirect(payload, partnerKey.publicKey, privateKey);
      await api(`/chat/direct/${partnerId}`, {
        method: 'POST',
        body: { ...box, senderKeyId: keyId, recipientKeyId: partnerKey.keyId },
      });
      await load();
      return true;
    } catch (err) {
      // The partner's key changed meanwhile: encrypt once more for the new one.
      if (retry && err instanceof ApiError && err.code === 'key_changed') {
        return send(payload, err.details.partnerKey, false);
      }
      setError(err.message);
      return false;
    }
  }

  // A report of one of the partner's messages (ReportDirectDialog). true when sent.
  async function report(body) {
    try {
      await api(`/chat/direct/${partnerId}/report`, { method: 'POST', body });
      return true;
    } catch {
      return false;
    }
  }

  return { data: state.data, messages: state.messages, error, send, report };
}
