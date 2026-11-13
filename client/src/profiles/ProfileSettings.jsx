// ============================================================
// File:        ProfileSettings.jsx
// Path:        client/src/profiles/ProfileSettings.jsx
// Project:     Seasonal Entertainment
// Description: The account page's "Profile" section (docs/AUTH.md, "Member profiles"; decided
//              2026-11-11): About me (at most 300 characters, counted as shown, the same rule as
//              the server's: shared/profileRules.js) and the profile picture (JPG, PNG, WebP or
//              GIF by the chat images' rules; a new one replaces the old; Remove takes it away).
//              What other members see is one link away (MemberProfilePage.jsx). The heading
//              is the account page's (Disclosure.jsx); onStatus(hasPicture) tells it whether a
//              picture is set, from this section's own load.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  ABOUT_MAX,
  aboutLength,
  validateAbout,
} from '@seasonal-entertainment/shared/profileRules.js';
import { api, upload } from '../api/http.js';
import { FormMessage } from '../components/FormField.jsx';
import { useSession } from '../session/SessionContext.jsx';
import { profilePath } from './profilePath.js';
import './profile.css';

const PICTURE_TYPES = 'image/jpeg,image/png,image/webp,image/gif';

export default function ProfileSettings({ onStatus }) {
  const { user } = useSession();
  const ownPath = profilePath(user.username); // the page, and its data under /api
  const [about, setAbout] = useState('');
  const [picture, setPicture] = useState(null);
  const [message, setMessage] = useState({});
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  const load = useCallback(
    () =>
      api(ownPath).then(({ profile }) => {
        setAbout(profile.about);
        setPicture(profile.picture);
        onStatus?.(Boolean(profile.picture));
      }),
    [ownPath, onStatus]
  );
  useEffect(() => {
    load().catch((err) => setMessage({ error: err.message }));
  }, [load]);

  // One change at a time; its outcome as the section's message.
  async function run(work, notice) {
    setBusy(true);
    setMessage({});
    try {
      await work();
      setMessage({ notice });
    } catch (err) {
      setMessage({ error: err.message });
    }
    setBusy(false);
  }

  function saveAbout(event) {
    event.preventDefault();
    const problem = validateAbout(about);
    if (problem) return setMessage({ error: problem });
    return run(() => api('/profile/about', { method: 'PUT', body: { about } }), 'Saved.');
  }

  function choose(event) {
    const [file] = event.target.files;
    event.target.value = ''; // the same file can be chosen again
    if (!file) return;
    run(async () => {
      await upload('/profile/picture', file, {});
      await load();
    }, 'Picture saved.');
  }

  const removePicture = () =>
    run(async () => {
      await api('/profile/picture', { method: 'DELETE' });
      await load();
    }, 'Picture removed.');

  const count = aboutLength(about);
  return (
    <>
      <p>
        Other signed-in members see your profile: your name, role, Discord steps, when you joined,
        and what you add here. <Link to={ownPath}>View my profile</Link>
      </p>
      <form onSubmit={saveAbout}>
        <label className="form-field">
          <span className="form-field__label">About me</span>
          <textarea rows={4} value={about} onChange={(e) => setAbout(e.target.value)} />
          <span className="form-field__hint">
            {count} / {ABOUT_MAX} characters. Plain text; links are not turned into links.
          </span>
        </label>
        <button className="button" type="submit" disabled={busy}>
          Save About me
        </button>
      </form>
      <h3>Profile picture</h3>
      {picture && (
        <img className="profile-settings__picture" src={picture.thumb} alt="Your profile picture" />
      )}
      <p className="member-profile__actions">
        {/* Hidden: the button opens it (as the chat's "Attach file", ComposerUpload.jsx). */}
        <input
          ref={fileInput}
          type="file"
          accept={PICTURE_TYPES}
          hidden
          aria-label="Profile picture file"
          onChange={choose}
        />
        <button
          className="button button--secondary"
          type="button"
          disabled={busy}
          onClick={() => fileInput.current.click()}
        >
          {picture ? 'Choose a new picture' : 'Choose a picture'}
        </button>
        {picture && (
          <button
            className="button button--secondary"
            type="button"
            disabled={busy}
            onClick={removePicture}
          >
            Remove picture
          </button>
        )}
      </p>
      <p className="form-field__hint">JPG, PNG, WebP or GIF, by the same rules as chat images.</p>
      <FormMessage error={message.error} notice={message.notice} />
    </>
  );
}
