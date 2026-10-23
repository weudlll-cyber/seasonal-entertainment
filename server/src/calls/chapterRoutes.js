// ============================================================
// File:        chapterRoutes.js
// Path:        server/src/calls/chapterRoutes.js
// Project:     Seasonal Entertainment
// Description: Chapter marks on a finished recording (docs/CALLS.md, "Recording"): organisers
//              and admins add, change and delete them (a time in m:ss or h:mm:ss within the
//              recording, a title of at most 80 characters; shared/chapterRules.js), audited.
//              Everyone who can see the call sees them with its recordings (recordings.js).
// ============================================================

import express from 'express';
import { chapterError, parseDuration } from '@seasonal-entertainment/shared/chapterRules.js';
import { sendError } from '../http/errors.js';
import { addChapter, deleteChapter, findChapter, updateChapter } from './chapters.js';
import { recordingSteps } from './recordingRoutes.js';
import { recordingLength } from './recordings.js';

export function chapterRoutes(db, config, service) {
  const router = express.Router();
  const { recording, manage, loadRecording, audit } = recordingSteps(db, config, service);
  const base = '/:id/recordings/:rid/chapters';

  // The chapter from the body ({ at: "12:30", title }), checked as the form checks it; null
  // after answering 400.
  const chapterInput = (req, res) => {
    // Within the recording: its length from the file, if nobody has listed it yet.
    const length = recordingLength(db, req.recording, recording.dir);
    const problem = chapterError(req.body ?? {}, length);
    if (problem) {
      sendError(res, 400, 'invalid_input', problem);
      return null;
    }
    return { at: parseDuration(req.body.at), title: req.body.title.trim() };
  };
  const loadChapter = (req, res, next) => {
    req.chapter = findChapter(db, req.recording.id, Number.parseInt(req.params.cid, 10));
    if (!req.chapter) return sendError(res, 404, 'not_found', 'No such chapter.');
    next();
  };
  const changed = (req, action, chapter) =>
    audit(req, action, req.call, { recording: req.recording.id, ...chapter });

  router.post(base, ...manage, loadRecording, (req, res) => {
    const input = chapterInput(req, res);
    if (!input) return;
    const chapter = addChapter(db, req.recording.id, input, req.user.username);
    changed(req, 'call.chapter_add', input);
    res.status(201).json({ ok: true, chapter });
  });

  router.put(`${base}/:cid`, ...manage, loadRecording, loadChapter, (req, res) => {
    const input = chapterInput(req, res);
    if (!input) return;
    updateChapter(db, req.chapter.id, input);
    changed(req, 'call.chapter_edit', input);
    res.json({ ok: true, chapter: { id: req.chapter.id, ...input } });
  });

  router.delete(`${base}/:cid`, ...manage, loadRecording, loadChapter, (req, res) => {
    deleteChapter(db, req.chapter.id);
    changed(req, 'call.chapter_delete', { at: req.chapter.at, title: req.chapter.title });
    res.json({ ok: true });
  });

  return router;
}
