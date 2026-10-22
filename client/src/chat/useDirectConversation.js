// ============================================================
// File:        useDirectConversation.js
// Path:        client/src/chat/useDirectConversation.js
// Project:     Seasonal Entertainment
// Description: Data of one direct conversation (docs/CHAT.md, "Direct messages"): loaded,
//              decrypted in the browser with the member's private key, kept live, marked read,
//              paged back 100 at a time (loadOlder; pages are merged by id, so a live reload
//              keeps them), and sending (encrypted for the partner's current key; once more
//              when a key changed meanwhile; a file's upload id goes along so the server links
//              it to the message). A report with shared messages also shares their files,
//              decrypted here (directFile.js).
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../api/http.js';
import { shareReportFiles } from './directFile.js';
import { mergeMessages } from './useChatRoom.js';
import { useDirectEvents } from './useDirect.js';

const crypto = () => import('@seasonal-entertainment/shared/crypto.js');

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

const EMPTY = { data: null, messages: [], more: false, olderLoaded: false };

// keyId, privateKey: the signed-in member's current key (keys/). Returns { data, messages,
// more, loadingOlder, loadOlder, error, send, report }.
export function useDirectConversation(partnerId, keyId, privateKey) {
  // partnerId inside: another conversation starts empty and is never merged with this one.
  const [state, setState] = useState({ ...EMPTY, partnerId });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState(null);
  const readUpTo = useRef(0);
  const current = state.partnerId === partnerId ? state : { ...EMPTY, partnerId };

  // The newest page, merged into what is shown: older pages loaded meanwhile stay. `more`
  // follows the newest page only until an older page has been loaded (then that one knows).
  const load = useCallback(async () => {
    try {
      const data = await api(`/chat/direct/${partnerId}`);
      const messages = await decryptAll(data, partnerId, { keyId, privateKey });
      setState((prev) => {
        if (prev.partnerId !== partnerId)
          return { ...EMPTY, partnerId, data, messages, more: data.more };
        const more = prev.olderLoaded ? prev.more : data.more;
        return { ...prev, data, messages: mergeMessages(prev.messages, messages), more };
      });
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

  // The 100 messages before the oldest shown, decrypted with the keys their page names.
  async function loadOlder() {
    const oldest = current.messages[0];
    if (!current.more || !oldest || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const data = await api(`/chat/direct/${partnerId}?before=${oldest.id}`);
      const page = await decryptAll(data, partnerId, { keyId, privateKey });
      setState((prev) =>
        prev.partnerId !== partnerId
          ? prev
          : {
              ...prev,
              messages: mergeMessages(prev.messages, page),
              more: data.more,
              olderLoaded: true,
            }
      );
    } catch (err) {
      setError(err.message);
    }
    setLoadingOlder(false);
  }

  // payload: { text, mediaItemId?, preview?, file? }. true when sent.
  async function send(payload, partnerKey = state.data?.partnerKey, retry = true) {
    setError(null);
    try {
      const { encryptDirect } = await crypto();
      const box = await encryptDirect(payload, partnerKey.publicKey, privateKey);
      await api(`/chat/direct/${partnerId}`, {
        method: 'POST',
        body: {
          ...box,
          senderKeyId: keyId,
          recipientKeyId: partnerKey.keyId,
          ...(payload.file && { fileId: payload.file.id }),
        },
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

  // A report of one of the partner's messages (ReportDirectDialog). true when sent. The files
  // of the shared messages follow, decrypted in this browser, as their text did.
  async function report(body) {
    try {
      const { reportId } = await api(`/chat/direct/${partnerId}/report`, { method: 'POST', body });
      const sharedIds = new Set((body.shared ?? []).map((c) => c.id));
      const files = current.messages
        .filter((m) => sharedIds.has(m.id) && m.payload?.file)
        .map((m) => ({ id: m.id, file: m.payload.file }));
      await shareReportFiles(partnerId, reportId, files);
      return true;
    } catch {
      return false;
    }
  }

  return {
    data: current.data,
    messages: current.messages,
    more: current.more,
    loadingOlder,
    loadOlder,
    error,
    send,
    report,
  };
}
