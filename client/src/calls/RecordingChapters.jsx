// ============================================================
// File:        RecordingChapters.jsx
// Path:        client/src/calls/RecordingChapters.jsx
// Project:     Seasonal Entertainment
// Description: A recording's chapters under its player (docs/CALLS.md, "Recording"): each a
//              time and a title; a click seeks the player there. Organisers and admins add,
//              change and delete them (a time in m:ss or h:mm:ss, a title of at most 80
//              characters; checked here as the server checks, shared/chapterRules.js).
// ============================================================

import { useState } from 'react';
import {
  CHAPTER_TITLE_MAX,
  chapterError,
  formatDuration,
} from '@seasonal-entertainment/shared/chapterRules.js';
import { api } from '../api/http.js';
import { FormField, FormMessage } from '../components/FormField.jsx';

// initial: the chapter being changed, or none for a new one.
function ChapterForm({ initial, onSave, onCancel }) {
  const [at, setAt] = useState(initial ? formatDuration(initial.at) : '');
  const [title, setTitle] = useState(initial?.title ?? '');
  return (
    <form
      className="form"
      aria-label={initial ? 'Change chapter' : 'New chapter'}
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ at, title });
      }}
    >
      <FormField
        label="Time"
        type="text"
        hint="m:ss or h:mm:ss"
        value={at}
        onChange={(event) => setAt(event.target.value)}
        placeholder="12:30"
      />
      <FormField
        label="Title"
        type="text"
        value={title}
        maxLength={CHAPTER_TITLE_MAX}
        onChange={(event) => setTitle(event.target.value)}
      />
      <button className="button" type="submit">
        Save chapter
      </button>
      <button className="link-button" type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

// recording: { id, seconds, chapters }; onSeek(seconds): moves the player; onChanged: reload
// the list.
export default function RecordingChapters({ callId, recording, canManage, onSeek, onChanged }) {
  const [editing, setEditing] = useState(null); // a chapter's id, 'new', or null
  const [error, setError] = useState(null);
  const base = `/calls/${callId}/recordings/${recording.id}/chapters`;
  const { chapters } = recording;

  async function run(call) {
    setError(null);
    try {
      await call();
      setEditing(null);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  const save = (chapter) => (input) => {
    const problem = chapterError(input, recording.seconds);
    if (problem) return setError(problem);
    return run(() =>
      api(chapter ? `${base}/${chapter.id}` : base, {
        method: chapter ? 'PUT' : 'POST',
        body: input,
      })
    );
  };

  if (chapters.length === 0 && !canManage) return null;
  return (
    <div className="recording-chapters">
      {chapters.length > 0 && (
        <ol aria-label="Chapters">
          {chapters.map((chapter) =>
            editing === chapter.id ? (
              <li key={chapter.id}>
                <ChapterForm
                  initial={chapter}
                  onSave={save(chapter)}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={chapter.id}>
                <button className="link-button" type="button" onClick={() => onSeek(chapter.at)}>
                  {formatDuration(chapter.at)} {chapter.title}
                </button>
                {canManage && (
                  <>
                    {' '}
                    <button
                      className="link-button"
                      type="button"
                      aria-label={`Change chapter ${chapter.title}`}
                      onClick={() => setEditing(chapter.id)}
                    >
                      Change
                    </button>{' '}
                    <button
                      className="link-button"
                      type="button"
                      aria-label={`Delete chapter ${chapter.title}`}
                      onClick={() => run(() => api(`${base}/${chapter.id}`, { method: 'DELETE' }))}
                    >
                      Delete
                    </button>
                  </>
                )}
              </li>
            )
          )}
        </ol>
      )}
      {canManage &&
        (editing === 'new' ? (
          <ChapterForm onSave={save(null)} onCancel={() => setEditing(null)} />
        ) : (
          <button
            className="button button--secondary"
            type="button"
            onClick={() => setEditing('new')}
          >
            Add chapter
          </button>
        ))}
      <FormMessage error={error} />
    </div>
  );
}
