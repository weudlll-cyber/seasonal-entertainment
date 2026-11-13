// ============================================================
// File:        MemberProfilePage.jsx
// Path:        client/src/profiles/MemberProfilePage.jsx
// Project:     Seasonal Entertainment
// Description: A member's profile at /members/<name> (docs/AUTH.md, "Member profiles";
//              docs/DESIGN.md, "Member profile"; decided 2026-11-11), for signed-in members
//              only (App.jsx wraps it in RequireUser: guests get the sign-in page). The picture,
//              the name, Admin or Organiser, the Discord steps with their names (StepList),
//              "Member since" as a date in the viewer's own time zone, and About me as plain
//              text: React writes it as text, so nothing in it ever becomes a link. "Send
//              message" opens a direct message (directView.js: the chat drawer brings its Direct
//              tab forward), not on one's own profile nor where they cannot receive one. Admins
//              can clear About me and remove the picture.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api/http.js';
import { formatDate } from '../app/dates.js';
import { StepList, requestDirect } from '../chat/index.js';
import { FormMessage } from '../components/FormField.jsx';
import { useSession } from '../session/SessionContext.jsx';
import './profile.css';

const ROLE_LABEL = { admin: 'Admin', organiser: 'Organiser' };

export default function MemberProfilePage() {
  const { username } = useParams();
  const { user } = useSession();
  const [profile, setProfile] = useState(undefined); // undefined: loading; null: not found
  const [error, setError] = useState(null);

  const load = useCallback(
    () =>
      api(`/members/${encodeURIComponent(username)}`)
        .then((answer) => setProfile(answer.profile))
        .catch((err) => (err.status === 404 ? setProfile(null) : setError(err.message))),
    [username]
  );
  useEffect(() => {
    load();
  }, [load]);

  // Admin moderation: each clear asks first, then the profile is read again.
  async function clear(part, question) {
    if (!window.confirm(question)) return;
    setError(null);
    try {
      await api(`/admin/users/${profile.id}/${part}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (profile === null) {
    return (
      <section className="page">
        <h1>Member not found</h1>
        <p>There is no member of this name.</p>
      </section>
    );
  }
  if (!profile) return <FormMessage error={error} />;

  const isAdmin = user.role === 'admin' && !profile.own;
  return (
    <section className="page member-profile" aria-labelledby="member-name">
      <div className="member-profile__head">
        {profile.picture ? (
          <img
            className="member-profile__picture"
            src={profile.picture.full}
            alt={`Profile picture of ${profile.username}`}
          />
        ) : (
          <span className="member-profile__picture member-profile__picture--none" aria-hidden>
            {profile.username.charAt(0).toUpperCase()}
          </span>
        )}
        <div>
          <h1 id="member-name">{profile.username}</h1>
          {ROLE_LABEL[profile.role] && (
            <p className="member-profile__role">{ROLE_LABEL[profile.role]}</p>
          )}
          <p className="member-profile__since">Member since {formatDate(profile.memberSince)}</p>
        </div>
      </div>
      <StepList steps={profile.steps} />
      <h2>About me</h2>
      {profile.about ? (
        <p className="member-profile__about">{profile.about}</p>
      ) : (
        <p className="member-profile__empty">Nothing here yet.</p>
      )}
      <div className="member-profile__actions">
        {!profile.own && profile.canReceive && (
          <button
            className="button"
            type="button"
            onClick={() => requestDirect({ id: profile.id, username: profile.username })}
          >
            Send message
          </button>
        )}
        {profile.own && (
          <Link className="button button--secondary" to="/account#profile">
            Edit my profile
          </Link>
        )}
        {isAdmin && profile.about && (
          <button
            className="button button--secondary"
            type="button"
            onClick={() => clear('about', `Clear the About me of ${profile.username}?`)}
          >
            Clear About me
          </button>
        )}
        {isAdmin && profile.picture && (
          <button
            className="button button--secondary"
            type="button"
            onClick={() => clear('picture', `Remove the picture of ${profile.username}?`)}
          >
            Remove picture
          </button>
        )}
      </div>
      <FormMessage error={error} />
    </section>
  );
}
