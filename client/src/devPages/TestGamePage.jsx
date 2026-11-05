// ============================================================
// File:        TestGamePage.jsx
// Path:        client/src/devPages/TestGamePage.jsx
// Project:     Seasonal Entertainment
// Description: Test-only page (routed only by the Vite dev server, never in production builds):
//              the fake game of npm run dev:game-status (docs/OPEN-ROUNDS.md, "Trying it
//              locally") at its own path, DEV_TEST_GAME.path. Its "Play" and its rounds' "Join"
//              (games/OpenRoundHint.jsx) lead here, instead of "Page not found" or the fake host
//              no browser can reach.
// ============================================================

import { Link } from 'react-router';

export default function TestGamePage() {
  return (
    <section className="page">
      <h1>Open rounds test</h1>
      <p>Test game — the sign-up would open here.</p>
      <p>
        <Link to="/">Back to the home page</Link>
      </p>
    </section>
  );
}
