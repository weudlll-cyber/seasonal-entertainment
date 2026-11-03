// ============================================================
// File:        StepBadge.jsx
// Path:        client/src/chat/StepBadge.jsx
// Project:     Seasonal Entertainment
// Description: A member's Discord steps as the site shows them (variant C, decided 2026-11-02;
//              docs/CHAT.md, "Discord steps"): StepBadge, the up to three step icons (Holder,
//              Farmer, Investor; the highest step of each) in one outlined badge after the name,
//              set apart from the Admin / Organiser badge, with one tooltip naming the steps; a
//              button, so a tap (touch screens) or Enter shows the tooltip too, and a full 44 px
//              touch target around the small frame. StepList, the
//              full step names with their icons (name menu, account page). StepIcon, the icon an
//              admin uploaded, or a neutral placeholder (the ladder's shape and the step's
//              initials, never a token colour) until there is one. StepMarks, the badge's look
//              inside another control (the member search). Steps come from the server
//              (computed there, never from what a browser sent).
// ============================================================

import { useState } from 'react';
import './StepBadge.css';

const LADDER_NAMES = { holder: 'Holder', farmer: 'Farmer', investor: 'Investor' };

// "Ultimate-Dragon Whale" -> "UD", "Level 4" -> "4", "Silver" -> "S".
export function stepInitials(name) {
  const number = /(\d+)\s*$/.exec(name);
  if (number) return number[1];
  return name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}

export function StepIcon({ step }) {
  if (step.icon) {
    return <img className={`step-icon step-icon--${step.ladder}`} src={step.icon} alt="" />;
  }
  return (
    <span
      className={`step-icon step-icon--placeholder step-icon--${step.ladder}`}
      aria-hidden="true"
    >
      <span>{stepInitials(step.name)}</span>
    </span>
  );
}

// The tooltip's text: every step's full name.
const stepNames = (steps) => steps.map((s) => s.name).join(' · ');

// The outlined frame with the icons, thin lines between them (the badge's look).
const frameItems = (steps) =>
  steps.map((step, index) => (
    <span key={step.ladder} className="step-badge__item">
      {index > 0 && <span className="step-badge__sep" aria-hidden="true" />}
      <StepIcon step={step} />
    </span>
  ));

export default function StepBadge({ steps }) {
  const [open, setOpen] = useState(false);
  if (!steps?.length) return null;
  const names = stepNames(steps);
  return (
    <button
      type="button"
      className={`step-badge${open ? ' step-badge--open' : ''}`}
      aria-label={`Discord steps: ${names}`}
      aria-expanded={open}
      onClick={() => setOpen((v) => !v)}
      onBlur={() => setOpen(false)}
    >
      <span className="step-badge__frame">{frameItems(steps)}</span>
      <span className="step-badge__tip" role="tooltip">
        {names}
      </span>
    </button>
  );
}

// The badge's look without its button (inside another control: a member search option, which
// may hold nothing interactive); its names are its label and title.
export function StepMarks({ steps }) {
  if (!steps?.length) return null;
  const names = stepNames(steps);
  return (
    <span
      className="step-badge__frame"
      role="img"
      aria-label={`Discord steps: ${names}`}
      title={names}
    >
      {frameItems(steps)}
    </span>
  );
}

// The full names, one per ladder (name menu, account page); `empty` when there are none.
export function StepList({ steps, empty = null }) {
  if (!steps?.length) return empty && <p>{empty}</p>;
  return (
    <ul className="step-list">
      {steps.map((step) => (
        <li key={step.ladder}>
          <StepIcon step={step} />
          <span>
            {step.name} <small>· {LADDER_NAMES[step.ladder]}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}
