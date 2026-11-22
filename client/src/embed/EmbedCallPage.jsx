// ============================================================
// File:        EmbedCallPage.jsx
// Path:        client/src/embed/EmbedCallPage.jsx
// Project:     Seasonal Entertainment
// Description: /embed/call/<id>?theme=<light|dark|auto>: the call view inside a game
//              (docs/GAME-INTEGRATION.md section 9, decided 2026-11-20). Listen only: it joins
//              through the call page's own join (useCallRoom, listenOnly, so the server gives a
//              listener's token whoever asks) and only on the Listen click inside the frame,
//              asking about a running recording first (RecordingConsent). The site's cookie
//              session, as the chat embed on this site's own pages; guests listen as on the
//              site. Shown only when a game of this site frames it (callView.js framingGame);
//              anywhere else only the link to the call page. The call is read again every few
//              seconds while not joined, so a start, an end or a deletion shows. Talks to the
//              game through embedProtocol.js under its own sources (seasonal-call,
//              seasonal-call-host): ready, live, ended, speaking, resize, error; it takes mute,
//              collapse, theme and visible. Nothing secret, no names, goes to the game.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { ApiError, api } from '../api/http.js';
import { useCallRoom } from '../calls/useCallRoom.js';
import { useSession } from '../session/SessionContext.jsx';
import { useTheme } from '../theme/ThemeContext.jsx';
import { CALL_HOST_SOURCE, CALL_SOURCE, framingGame, onPhone, resizeFor } from './callView.js';
import EmbedCallView from './EmbedCallView.jsx';
import { onHostMessage, toHost } from './embedProtocol.js';

export const POLL_MS = 5000;
const THEMES = ['light', 'dark', 'auto'];
const themeOf = (value) => (THEMES.includes(value) ? value : 'auto');

// The frame's size, kept current.
function useFrameSize() {
  const read = () => ({ width: window.innerWidth, height: window.innerHeight });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const update = () => setSize(read());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return size;
}

// Calls send(value) whenever value changes after it is first known (undefined: not yet).
function useOnChange(value, send) {
  const last = useRef(undefined);
  useEffect(() => {
    if (value === undefined || value === last.current) return;
    const first = last.current === undefined;
    last.current = value;
    send(value, first);
  }, [value, send]);
}

export default function EmbedCallPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  // Decided once: a game of this site frames the view, or nobody may use it here.
  const [game] = useState(() => framingGame());
  const host = game ? window.location.origin : null;
  const say = useCallback((type, data) => toHost(host, type, data, CALL_SOURCE), [host]);
  const [theme, setTheme] = useState(() => themeOf(params.get('theme')));
  const [visible, setVisible] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [declined, setDeclined] = useState(false);
  // GET /api/calls/:id's call; gone: deleted or never there.
  const [call, setCall] = useState(null);
  const [gone, setGone] = useState(false);
  const [round, setRound] = useState(0);
  const size = useFrameSize();
  const { user } = useSession();
  const { force } = useTheme();
  const live = useCallRoom(id, { listenOnly: true });
  const joined = live.status === 'joined';

  useEffect(() => {
    force(theme === 'auto' ? null : theme);
    return () => force(null);
  }, [theme, force]);

  // The call, read again while not joined and not over (in the call its own events say it).
  const over = gone || live.status === 'ended' || call?.status === 'ended';
  useEffect(() => {
    if (!game || joined || over) return undefined;
    let stopped = false;
    api(`/calls/${id}`)
      .then((answer) => !stopped && setCall(answer.call))
      .catch((err) => {
        if (!stopped && err instanceof ApiError && err.status === 404) setGone(true);
      });
    const again = setTimeout(() => setRound((n) => n + 1), POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(again);
    };
  }, [game, id, joined, over, round]);

  useEffect(
    () =>
      onHostMessage(
        host,
        (message) => {
          if (message.type === 'mute') setMuted(message.muted === true);
          if (message.type === 'collapse') setCollapsed(message.collapsed === true);
          if (message.type === 'theme') setTheme(themeOf(message.theme));
          if (message.type === 'visible') setVisible(message.visible !== false);
        },
        CALL_HOST_SOURCE
      ),
    [host]
  );

  const status = gone || live.status === 'ended' ? 'ended' : call?.status;
  const signedIn = user === undefined ? undefined : Boolean(user);
  // ready: once the call and the account are known, again when either changes.
  const readyKey = status && signedIn !== undefined ? `${status}|${signedIn}` : undefined;
  useOnChange(
    readyKey,
    useCallback(
      () => say('ready', { call: Number(id), status, signedIn }),
      [say, id, status, signedIn]
    )
  );
  // live: the call went live, or listening started or stopped (not for the first answer).
  const liveKey = status === 'live' ? `live|${joined}` : status && 'not-live';
  useOnChange(
    liveKey,
    useCallback(
      (key, first) => !first && key !== 'not-live' && say('live', { listening: joined }),
      [say, joined]
    )
  );
  useOnChange(
    status === 'ended' ? (gone ? 'gone' : 'ended') : undefined,
    useCallback((reason) => say('ended', { reason }), [say])
  );
  const speakers = live.people.filter((p) => p.speaker && !p.isLocal);
  const active = joined && speakers.some((p) => live.activeSpeakers.has(p.identity));
  useOnChange(
    joined ? active : undefined,
    useCallback((value, first) => (value || !first) && say('speaking', { active: value }), [say])
  );
  const errorCode = declined ? 'recording_consent' : live.errorCode;
  useOnChange(
    errorCode ?? undefined,
    useCallback((code) => say('error', { code }), [say])
  );

  // The visitor's own switch: the other form, and the size it needs from the game.
  function switchForm(toCollapsed) {
    setCollapsed(toCollapsed);
    say('resize', resizeFor(toCollapsed ? 'collapsed' : 'picture', { ...size, phone: onPhone() }));
  }

  return (
    <EmbedCallView
      id={id}
      allowed={Boolean(game)}
      call={call}
      status={status}
      gone={gone}
      live={live}
      size={size}
      collapsed={collapsed}
      visible={visible}
      muted={muted}
      onListen={() => {
        setDeclined(false);
        live.controls.join();
      }}
      onDecline={() => {
        setDeclined(true);
        live.controls.declineRecording();
      }}
      onMute={() => setMuted(!muted)}
      onCollapse={switchForm}
    />
  );
}
