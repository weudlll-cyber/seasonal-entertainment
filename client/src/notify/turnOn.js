// ============================================================
// File:        turnOn.js
// Path:        client/src/notify/turnOn.js
// Project:     Seasonal Entertainment
// Description: "Turn on notifications", the one way the site asks the browser for permission
//              (account page and the chat menu; docs/CHAT.md, "Notifications"): asks, and when
//              the member allows it while both switches are still off, turns both on. Saving a
//              switch: PUT /api/auth/notifications, then the session is read again.
// ============================================================

import { api } from '../api/http.js';
import { askPermission } from './systemNotify.js';

// settings: { notifyMentions?, notifyDirect?, notifyRecap? }; refresh: the session's.
export async function saveNotificationSwitches(settings, refresh) {
  await api('/auth/notifications', { method: 'PUT', body: settings });
  await refresh();
}

// Returns the browser's answer: 'granted', 'denied' or 'default' (closed without choosing).
export async function turnOnNotifications(user, refresh) {
  const answer = await askPermission();
  if (answer === 'granted' && !user.notifyMentions && !user.notifyDirect) {
    await saveNotificationSwitches({ notifyMentions: true, notifyDirect: true }, refresh);
  }
  return answer;
}
