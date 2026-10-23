// ============================================================
// File:        useSystemNotifications.js
// Path:        client/src/notify/useSystemNotifications.js
// Project:     Seasonal Entertainment
// Description: Turns the member's own live events into browser notifications (docs/CHAT.md,
//              "Notifications"): a mention ("<name> mentioned you in <room>: <first 80
//              characters>"), a new direct message ("New message from <name>" — never its
//              text) and the weekly recap ("Weekly recap is out"). Only for the switches the member turned on, with the browser's permission,
//              and only when no tab of the site is visible; one per event across tabs. A click
//              focuses the site and opens the room (the recap's room) or the conversation.
// ============================================================

import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { usePersonalEvents } from '../chat/index.js';
import { useSession } from '../session/SessionContext.jsx';
import { anyTabVisible, notifyOnce, permission, trackVisibility } from './systemNotify.js';

const MENTION_MAX = 80;

// What a notification says and opens, for an event the member wants; null otherwise.
export function notificationFor(event, user) {
  if (event.type === 'mention' && user.notifyMentions) {
    return {
      key: `mention-${event.id}`,
      body: `${event.author} mentioned you in ${event.roomName}: ${event.text.slice(0, MENTION_MAX)}`,
      path: `/chat?room=${encodeURIComponent(event.room)}`,
    };
  }
  if (event.type === 'recap' && user.notifyRecap) {
    return {
      key: `recap-${event.id}`,
      body: 'Weekly recap is out',
      path: `/chat?room=${encodeURIComponent(event.room)}`,
    };
  }
  if (event.type === 'direct' && user.notifyDirect && event.message.senderId !== user.id) {
    const from = event.message.senderId;
    return {
      key: `direct-${event.message.id}`,
      body: `New message from ${event.senderName}`,
      path: `/chat?direct=${from}&name=${encodeURIComponent(event.senderName)}`,
    };
  }
  return null;
}

export function useSystemNotifications() {
  const { user } = useSession();
  const navigate = useNavigate();
  const current = useRef(user);
  useEffect(() => {
    current.current = user;
  }, [user]);
  useEffect(() => trackVisibility(), []);

  const onEvent = useCallback(
    (event) => {
      const member = current.current;
      const wanted = member && notificationFor(event, member);
      if (!wanted || permission() !== 'granted' || anyTabVisible()) return;
      notifyOnce(wanted.key, wanted.body, () => navigate(wanted.path));
    },
    [navigate]
  );
  usePersonalEvents(onEvent);
}
