// ============================================================
// File:        job.js
// Path:        server/src/recap/job.js
// Project:     Seasonal Entertainment
// Description: The weekly recap's posting (docs/CHAT.md, "Weekly recap"): once per week, from the
//              weekday and hour of its settings (Monday 09:00 Vienna time by default), in the room
//              of its setting ("announcements" by default; "announcements" or "general" when that
//              room is gone), from the site itself (the chat's system.post); not at all while "Post
//              the weekly recap" is off. The week it was posted for is stored ("recap.lastWeek"),
//              and only a later week is due, so a restart or a changed day or hour never posts
//              twice in one week; a server that was down at 09:00 posts it when it is back, the
//              same week; a new site's first start counts the week begun as done (its first recap
//              comes the next Monday). Members who turned on "Weekly recap" get a personal "recap"
//              event on their open pages (a browser notification there). Runs like the call jobs
//              (calls/reminders.js): at start, then every minute. postRecap is also the admins'
//              "Post recap now" (routes.js), which does not count as the week's.
// ============================================================

import { startOfWeek, weekTime } from '@seasonal-entertainment/shared/localWeek.js';
import { recapNotifyIds } from '../accounts/userStore.js';
import { RECAP_DAYS } from '../settings/groups/recap.js';
import { getSetting, getTextSetting, setSetting } from '../settings/store.js';
import { priceChanges, recentRecordings, upcomingWeek } from './sources.js';
import { RECAP_ZONE, recapText } from './text.js';

// After the room of the setting: where the recap goes when that room no longer exists.
const RECAP_ROOMS = ['announcements', 'general'];
const LAST_WEEK = 'recap.lastWeek';
const CHECK_MS = 60_000;

// When a week's recap is due: the settings' weekday at their hour, local time (weekTime keeps
// it right on a daylight-saving day).
function postingTime(db, week) {
  const day = RECAP_DAYS.findIndex((d) => d.value === getSetting(db, 'recap.weekday'));
  const hour = Number(getSetting(db, 'recap.time').slice(0, 2));
  return weekTime(week, day, hour, RECAP_ZONE);
}

// deps: { db, config, chat (the chat handle: system.post, notify.member), callsConfigured,
// log }. Posts the recap for `now`; returns the message, or null when there is no room.
export function postRecap(
  { db, config, chat, callsConfigured, log = console.log },
  now = Date.now()
) {
  const body = recapText(
    {
      weekStart: startOfWeek(now, RECAP_ZONE),
      prices: priceChanges(config, log),
      upcoming: upcomingWeek(db, config, callsConfigured, now, log),
      recordings: recentRecordings(db, now),
    },
    now
  );
  const message = chat.system.post([getSetting(db, 'recap.room'), ...RECAP_ROOMS], body);
  if (message) {
    for (const userId of recapNotifyIds(db)) {
      chat.notify.member(userId, { type: 'recap', id: message.id, room: message.room });
    }
  }
  return message;
}

// The latest week (its Monday 00:00 in Vienna, ms) whose posting time has passed at `now`.
function latestWeek(db, now) {
  const week = startOfWeek(now, RECAP_ZONE);
  return now >= postingTime(db, week) ? week : startOfWeek(now, RECAP_ZONE, -1);
}

// The week whose recap is due at `now`, or null. On the very first round (nothing stored yet,
// a new site) the latest week counts as done: a site first started on a Friday posts its
// first recap on Monday, not that Friday. Only a week after the last one posted is due: moving
// the day or hour later in the week makes the latest week the previous one, which never posts.
function dueWeek(db, now = Date.now()) {
  const latest = latestWeek(db, now);
  const last = getTextSetting(db, LAST_WEEK);
  if (last === null) {
    setSetting(db, LAST_WEEK, latest);
    return null;
  }
  return latest > Number(last) ? latest : null;
}

// One round: the week's recap when it is due; true when one was posted.
export function weeklyRecapRound(deps, now = Date.now()) {
  if (!getSetting(deps.db, 'recap.enabled')) return false;
  const week = dueWeek(deps.db, now);
  if (week === null) return false;
  postRecap(deps, now);
  setSetting(deps.db, LAST_WEEK, week);
  return true;
}

// Starts the job; returns the function that stops it, or null when background jobs are off.
export function startWeeklyRecap(deps) {
  if (!deps.config.backgroundJobs) return null;
  const log = deps.log ?? console.log;
  const run = () => {
    try {
      if (weeklyRecapRound(deps)) log('[recap] posted the weekly recap');
    } catch (error) {
      log(`[recap] round skipped: ${error.message}`);
    }
  };
  run();
  const timer = setInterval(run, CHECK_MS);
  timer.unref(); // never keeps the process alive on its own
  return () => clearInterval(timer);
}
