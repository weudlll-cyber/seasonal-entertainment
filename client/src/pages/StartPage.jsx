// ============================================================
// File:        StartPage.jsx
// Path:        client/src/pages/StartPage.jsx
// Project:     Seasonal Entertainment
// Description: /start, "Start here" (docs/DESIGN.md, "Start here"): five short steps for a
//              newcomer, each a sentence or two and a button to a page the site already has —
//              what Seasonal Tokens are, how they work, the risks (info pages), the prices and
//              the fair price, then the chat and the next call (the live or next planned call,
//              else the Calls page). Under them the notice "Information only — not financial
//              advice." Linked from the sidebar for everyone and from home for guests.
// ============================================================

import { Link } from 'react-router';
import PageHeader from '../brand/PageHeader.jsx';
import { nextCallOf, useCalls } from '../calls/useCalls.js';
import NotAdvice from '../components/NotAdvice.jsx';
import './StartPage.css';

const LEAD = 'New to Seasonal Tokens? Five short steps to find your way around.';

// The steps; the last one's second button depends on the calls (nextCall).
function steps(nextCall) {
  return [
    {
      title: 'What are Seasonal Tokens',
      text: 'Four tokens, one for each season, that are mined and traded. Start with what they are and where they come from.',
      links: [['/info/what-are-seasonal-tokens', 'What are Seasonal Tokens']],
    },
    {
      title: 'How it works',
      text: 'Each token is mined at its own rate, and that rate halves on a fixed schedule. Read how the seasons take turns.',
      links: [['/info/how-it-works', 'How it works']],
    },
    {
      title: 'Know the risks',
      text: 'Crypto prices can move sharply, and you can lose money. Read the risks before you decide anything.',
      links: [['/info/risks', 'Risks']],
    },
    {
      title: 'See the prices and the fair price',
      text: 'The latest prices of the four tokens, their charts, and a fair price worked out from how fast each one is mined.',
      links: [['/info/prices', 'Prices and fair price']],
    },
    {
      title: 'Join the chat and the next call',
      text: 'Say hello in the chat, and listen in on a community call on this site.',
      links: [
        ['/chat', 'Open the chat'],
        nextCall
          ? [`/calls/${nextCall.id}`, `The next call: ${nextCall.title}`]
          : ['/calls', 'Calls'],
      ],
    },
  ];
}

export default function StartPage() {
  const calls = useCalls();
  return (
    <section className="page">
      <PageHeader quarter="chat" title="Start here" lead={LEAD} />
      <ol className="start__steps" aria-label="Steps">
        {steps(nextCallOf(calls)).map((step) => (
          <li key={step.title} className="card start__step">
            <h2>{step.title}</h2>
            <p>{step.text}</p>
            <p className="start__links">
              {step.links.map(([to, label]) => (
                <Link key={to} className="button" to={to}>
                  {label}
                </Link>
              ))}
            </p>
          </li>
        ))}
      </ol>
      <NotAdvice />
    </section>
  );
}
