// ============================================================
// File:        Countdown.jsx
// Path:        client/src/polls/Countdown.jsx
// Project:     Seasonal Entertainment
// Description: The time left of a poll started in a call (PollCard.jsx; docs/POLLS.md, "Polls in
//              a call"): "1:23 left", counted down every second from its end time, "Ending…"
//              at 0 until the list reloads and shows it ended. A timer to screen readers, not
//              read out every second.
// ============================================================

import { useEffect, useState } from 'react';

export default function Countdown({ endsAt }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, Math.ceil((Date.parse(endsAt) - now) / 1000));
  const text = left
    ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left`
    : 'Ending…';
  return (
    <span role="timer" aria-live="off" className="poll-countdown">
      {text}
    </span>
  );
}
