// ============================================================
// File:        ChatPage.jsx
// Path:        client/src/pages/ChatPage.jsx
// Project:     Seasonal Entertainment
// Description: /chat: the rooms this visitor may read, the current room's messages (live via
//              WebSocket), the composer where they may write (ChatComposer), and per-message
//              actions. Guests get a guest name with their first message.
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import ChatComposer from '../chat/ChatComposer.jsx';
import ChatMessage from '../chat/ChatMessage.jsx';
import { useChatSocket } from '../chat/useChatSocket.js';
import { FormMessage } from '../components/FormField.jsx';
import { useSession } from '../session/SessionContext.jsx';
import './ChatPage.css';

const ACTION_DONE = {
  report: 'Reported. Thank you.',
  hide: 'Message hidden.',
  mute: 'Author muted.',
  ban: 'Author banned from the chat.',
};

export default function ChatPage() {
  const { user } = useSession();
  const [info, setInfo] = useState(null); // { rooms, me }
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [version, setVersion] = useState(0); // bumped to reload rooms (e.g. new guest name)
  const userId = user?.id;

  useEffect(() => {
    api('/chat/rooms')
      .then((data) => {
        setInfo(data);
        setRoom((current) => current ?? data.rooms[0]?.slug ?? null);
      })
      .catch((err) => setError(err.message));
  }, [userId, version]);

  useEffect(() => {
    if (!room) return;
    api(`/chat/rooms/${room}/messages`)
      .then((data) => setMessages(data.messages))
      .catch((err) => setError(err.message));
  }, [room, userId]);

  useChatSocket(room, (event) => {
    if (event.type === 'message' && event.message.room === room) {
      setMessages((list) =>
        list.some((m) => m.id === event.message.id) ? list : [...list, event.message]
      );
    } else if (event.type === 'hidden' && !info?.me.moderator) {
      setMessages((list) => list.filter((m) => m.id !== event.id));
    }
  });

  // true when sent, so the composer clears its field.
  async function send(body) {
    setError(null);
    try {
      const { message } = await api(`/chat/rooms/${room}/messages`, {
        method: 'POST',
        body: { body },
      });
      setMessages((list) => (list.some((m) => m.id === message.id) ? list : [...list, message]));
      if (!user && !info.me.guestName) setVersion((v) => v + 1);
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

  const current = info?.rooms.find((r) => r.slug === room);
  return (
    <section className="page page--wide chat">
      <h1>Chat</h1>
      <nav aria-label="Rooms">
        <ul className="chat-rooms">
          {info?.rooms.map((r) => (
            <li key={r.slug}>
              <button
                type="button"
                className={`chat-room${r.slug === room ? ' chat-room--current' : ''}`}
                aria-current={r.slug === room ? 'page' : undefined}
                onClick={() => setRoom(r.slug)}
              >
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <ol className="chat-messages" aria-label={`Messages in ${current?.name ?? 'the room'}`}>
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} moderator={info?.me.moderator} onAction={act} />
        ))}
      </ol>
      <FormMessage error={error} notice={notice} />
      {current?.canWrite ? (
        <ChatComposer user={user} guestName={info.me.guestName} onSend={send} />
      ) : (
        current && <p className="chat-note">You can read this room, but not write in it.</p>
      )}
    </section>
  );
}
