// ============================================================
// File:        useChatRoom.js
// Path:        client/src/chat/useChatRoom.js
// Project:     Seasonal Entertainment
// Description: A chat panel's state: the rooms this viewer may read, the current room's
//              messages (loaded once the account is known, then kept live through the shared
//              connection), sending, and per-message actions (report, moderation). Reloads
//              when the account changes.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { api } from '../api/http.js';
import { joinRoom } from './connection.js';

const ACTION_DONE = {
  report: 'Reported. Thank you.',
  hide: 'Message hidden.',
  mute: 'Author muted.',
  ban: 'Author banned from the chat.',
  'preview/remove': 'Preview removed.',
  'file/remove': 'File removed.',
};

// A pushed event applied to the message list. moderator: hidden messages and held-back
// previews stay visible to moderators.
export function applyEvent(list, event, moderator) {
  const update = (change) => list.map((m) => (m.id === event.id ? { ...m, ...change } : m));
  switch (event.type) {
    case 'message':
      return list.some((m) => m.id === event.message.id) ? list : [...list, event.message];
    case 'hidden':
      return moderator ? list : list.filter((m) => m.id !== event.id);
    case 'preview':
      return update({ preview: event.preview });
    case 'previewRemoved':
      return update({ preview: null });
    case 'previewHidden':
      return moderator ? list : update({ preview: null });
    case 'fileRemoved':
      return update({ file: { removed: true } });
    default:
      return list;
  }
}

export function useChatRoom(initialRoom, user) {
  const [info, setInfo] = useState(null); // { rooms, me }
  const [room, setRoom] = useState(initialRoom);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [version, setVersion] = useState(0); // bumped to reload rooms (e.g. new guest name)
  const moderator = useRef(false);
  const userId = user?.id;
  // undefined while the account is still loading: wait, so rooms and messages are fetched once
  // for the right reader (a second fetch would replace live updates that arrived meanwhile).
  const known = user !== undefined;
  moderator.current = Boolean(info?.me.moderator);

  useEffect(() => {
    if (!known) return;
    api('/chat/rooms')
      .then(setInfo)
      .catch((err) => setError(err.message));
  }, [known, userId, version]);

  useEffect(() => {
    if (!known) return;
    setMessages([]);
    api(`/chat/rooms/${room}/messages`)
      .then((data) => setMessages(data.messages))
      .catch((err) => setError(err.message));
  }, [known, room, userId]);

  useEffect(
    () =>
      joinRoom(room, (event) => setMessages((list) => applyEvent(list, event, moderator.current))),
    [room]
  );

  // payload: the request body. true when sent, so the composer can clear itself.
  async function send(payload) {
    setError(null);
    try {
      const { message } = await api(`/chat/rooms/${room}/messages`, {
        method: 'POST',
        body: payload,
      });
      setMessages((list) => applyEvent(list, { type: 'message', message }));
      if (!user && !info?.me.guestName) setVersion((v) => v + 1);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  async function act(action, message, minutes) {
    setError(null);
    setNotice(null);
    try {
      const body = action === 'mute' ? { minutes } : {};
      await api(`/chat/messages/${message.id}/${action}`, { method: 'POST', body });
      setNotice(ACTION_DONE[action]);
      if (action === 'preview/remove') {
        setMessages((list) => applyEvent(list, { type: 'previewRemoved', id: message.id }));
      }
      if (action === 'file/remove') {
        setMessages((list) => applyEvent(list, { type: 'fileRemoved', id: message.id }));
      }
      if (action === 'hide') {
        setMessages((list) =>
          list.map((m) =>
            m.id === message.id ? { ...m, hiddenAt: 'now', hiddenBy: user.username } : m
          )
        );
      }
    } catch (err) {
      setError(err.message);
    }
  }

  const current = info?.rooms.find((r) => r.slug === room) ?? null;
  return { info, room, setRoom, current, messages, error, notice, send, act };
}
