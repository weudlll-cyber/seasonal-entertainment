// ============================================================
// File:        useChatRoom.js
// Path:        client/src/chat/useChatRoom.js
// Project:     Seasonal Entertainment
// Description: A chat panel's state: the rooms this viewer may read, the current room's
//              messages (loaded once the account is known, then kept live through the shared
//              connection), sending, and per-message actions (report, moderation). When the
//              account changes (login, logout, switch) it reloads the rooms and messages and
//              the shared connection reconnects as the new reader.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/http.js';
import { connectAs, joinRoom } from './connection.js';
import { useChatRooms } from './useChatRooms.js';

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

// roomInput: the panel's `room` input. The reader's tab choice holds while the input stays the
// same; a new input (the host switched rooms) wins.
export function useChatRoom(roomInput, user) {
  const rooms = useChatRooms();
  const info = rooms.info; // { rooms, me }
  const [choice, setChoice] = useState({ input: roomInput, room: roomInput });
  const room = choice.input === roomInput ? choice.room : roomInput;
  const setRoom = (slug) => setChoice({ input: roomInput, room: slug });
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const moderator = useRef(false);
  const seen = useRef({ room: null, id: 0 }); // the read marker already sent for this room
  const userId = user?.id;
  // undefined while the account is still loading: wait, so rooms and messages are fetched once
  // for the right reader (a second fetch would replace live updates that arrived meanwhile).
  const known = user !== undefined;
  moderator.current = Boolean(info?.me.moderator);

  useEffect(() => {
    if (!known) return;
    setMessages([]);
    api(`/chat/rooms/${room}/messages`)
      .then((data) => setMessages(data.messages))
      .catch((err) => setError(err.message));
  }, [known, room, userId]);

  // Before joinRoom below: on an account change the socket is reopened as the new reader.
  useEffect(() => {
    if (known) connectAs(userId ?? null);
  }, [known, userId]);

  useEffect(
    () =>
      joinRoom(room, (event) => setMessages((list) => applyEvent(list, event, moderator.current))),
    [room]
  );

  // The newest message in view: the member's read marker moves (guests keep none). Only
  // forward, and once per message.
  const markSeen = useCallback(
    (lastId) => {
      if (!userId) return;
      if (seen.current.room === room && seen.current.id >= lastId) return;
      seen.current = { room, id: lastId };
      api(`/chat/rooms/${room}/read`, { method: 'POST', body: { lastId } }).catch(() => {});
    },
    [room, userId]
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
      if (!user && !info?.me.guestName) rooms.reload(); // the new guest name
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
  return {
    info,
    room,
    setRoom,
    current,
    messages,
    error: error ?? rooms.error,
    notice,
    send,
    act,
    markSeen,
  };
}
