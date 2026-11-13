// ============================================================
// File:        ProfileName.jsx
// Path:        client/src/profiles/ProfileName.jsx
// Project:     Seasonal Entertainment
// Description: A person's name in a call (speaker tiles, the listener panel) as a link to their
//              profile (docs/AUTH.md, "Member profiles"), opening in a new tab so the call goes
//              on. Only for a member or host whose name is shown: a guest has no profile, and a
//              listener who hides their online status ("A listener", shared/callPeople.js) is
//              never revealed. Otherwise the plain text. A guest viewer following it gets the
//              sign-in page there, as for any members-only page.
// ============================================================

import { HIDDEN_LISTENER } from '@seasonal-entertainment/shared/callPeople.js';
import { profilePath } from './profilePath.js';
import './profile.css';

// person: the page's view of a participant (stageModel.js personOf); children: the text shown.
export default function ProfileName({ person, children }) {
  if (person.kind === 'guest' || person.name === HIDDEN_LISTENER) return children;
  return (
    <a
      className="profile-name"
      href={profilePath(person.name)}
      target="_blank"
      rel="noopener noreferrer"
      title={`Profile of ${person.name} (opens in a new tab)`}
    >
      {children}
    </a>
  );
}
