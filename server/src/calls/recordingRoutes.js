// ============================================================
// File:        recordingRoutes.js
// Path:        server/src/calls/recordingRoutes.js
// Project:     Seasonal Entertainment
// Description: Call recording (docs/CALLS.md, "Recording", decided 2026-10-22), on only when
//              recording is configured (config.calls.recording); starting one also needs the
//              "Recording allowed" setting (stopping and deleting never do). Organisers and
//              admins start and stop the recording of a live call (one at a time; audited); the
//              room's metadata then says a recording runs (roomState.js), which every client
//              shows: "starting" until the egress reports it active, then "active"
//              (recordingStart.js watches it; a start that does not come is dropped). Stopping is
//              allowed while it starts. Ending the call stops it (endCall.js). The recordings of a call are listed, and played
//              (with range requests, so a player can seek), for the same audience as the call
//              itself; organisers and admins delete one (file and row). A start the recording
//              service does not answer (timeout, unavailable) is 503 recording_unavailable, not a
//              server error. Nothing is deleted
//              automatically. The archive lists every finished recording with its call and
//              chapters (GET /api/calls/recordings), and one of them for its share page
//              (GET /api/calls/recordings/:rid, recordingShare.js); the chapter routes are
//              chapterRoutes.js.
// ============================================================

import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { getSetting } from '../settings/store.js';
import { callSteps } from './middleware.js';
import {
  activeRecording,
  deleteRecordingRow,
  dropStartingRecording,
  findListedRecording,
  findRecording,
  listAllRecordings,
  listRecordings,
  markRecordingStopped,
} from './recordings.js';
import { publishRoomState } from './roomState.js';
import { canManage } from './routes.js';
import { startCallRecording } from './recordingStart.js';
import { serviceDidNotAnswer } from './service.js';

// Stops the call's running recording, if any: the egress, then its row, then the room says so.
// Used by the stop route and by endCall.js (where the room is closed right after). One not yet
// active (starting, or waiting for the first speaker) has no file: its row goes, without a
// failure notice (recordingStart.js then ends).
export async function stopCallRecording(db, service, call) {
  const running = activeRecording(db, call.id);
  if (!running) return false;
  await service.stopRecording(running.egressId);
  if (!running.activeAt) {
    dropStartingRecording(db, running, { notice: false });
    return true;
  }
  return markRecordingStopped(db, running.id);
}

// The checks the recording routes share (here and chapterRoutes.js): recording set up
// (enabled), an organiser's action on a call (manage), one finished recording of the call
// (loadRecording, :rid) and the audit entry (after: what changed, the call's title by default).
export function recordingSteps(db, config, service) {
  const steps = callSteps(db, config, service);
  const recording = config.calls?.recording ?? null;
  const enabled = (_req, res, next) =>
    recording ? next() : sendError(res, 404, 'recording_off', 'Recording is not set up.');
  const audit = (req, action, call, after = { title: call.title }) =>
    recordAudit(db, req.user, { action, targetType: 'call', targetId: call.id, after });
  const manage = [allow('organiser'), steps.configured, enabled, steps.loadCall, steps.perUser];
  const loadRecording = (req, res, next) => {
    const found = findRecording(db, req.call.id, Number.parseInt(req.params.rid, 10));
    if (!found?.stoppedAt) return sendError(res, 404, 'not_found', 'No such recording.');
    req.recording = found;
    next();
  };
  return { steps, recording, enabled, audit, manage, loadRecording };
}

export function callRecordingRoutes(db, config, service) {
  const router = express.Router();
  const { steps, recording, enabled, audit, manage, loadRecording } = recordingSteps(
    db,
    config,
    service
  );
  // The egress writes into it: it must exist before the first recording.
  if (recording) mkdirSync(recording.dir, { recursive: true });

  // The archive (/calls/recordings): every finished recording, with its call; the same
  // audience as the calls (everyone). canManage: the chapters can be edited.
  router.get('/recordings', allow('public'), steps.configured, (req, res) => {
    const list = recording ? listAllRecordings(db, recording.dir) : [];
    res.json({ ok: true, canManage: canManage(req), recordings: list });
  });

  // One finished recording with its call (the share page, /recordings/:id; recordingShare.js).
  router.get('/recordings/:rid', allow('public'), steps.configured, (req, res) => {
    const found =
      recording && findListedRecording(db, Number.parseInt(req.params.rid, 10) || 0, recording.dir);
    if (!found) return sendError(res, 404, 'not_found', 'No such recording.');
    res.json({ ok: true, canManage: canManage(req), recording: found });
  });

  router.post('/:id/recording/start', ...manage, steps.live, async (req, res) => {
    if (!getSetting(db, 'calls.recording')) {
      return sendError(
        res,
        403,
        'recording_not_allowed',
        'Recording is switched off at the moment.'
      );
    }
    if (activeRecording(db, req.call.id)) {
      return sendError(res, 409, 'recording_running', 'This call is being recorded already.');
    }
    try {
      // Starting until the egress reports it active (recordingStart.js).
      await startCallRecording(db, service, req.call, req.user.username);
    } catch (error) {
      // An egress that declines the job (no free CPU, docs/CALLS.md, "Recording") or is down
      // never answers: tell the organiser, keep the log short; nothing was stored yet.
      if (!serviceDidNotAnswer(error)) throw error;
      console.error(`[calls] recording of call ${req.call.id} not started: ${error.message}`);
      return sendError(
        res,
        503,
        'recording_unavailable',
        'The recording service did not answer. Try again in a minute.'
      );
    }
    audit(req, 'call.recording_start', req.call);
    res.json({ ok: true });
  });

  router.post('/:id/recording/stop', ...manage, async (req, res) => {
    if (!(await stopCallRecording(db, service, req.call))) {
      return sendError(res, 409, 'not_recording', 'This call is not being recorded.');
    }
    await publishRoomState(db, service, req.call);
    audit(req, 'call.recording_stop', req.call);
    res.json({ ok: true });
  });

  // The same audience as the call itself (calls are shown to everyone).
  router.get('/:id/recordings', allow('public'), steps.configured, steps.loadCall, (req, res) => {
    const list = recording ? listRecordings(db, req.call.id, recording.dir) : [];
    res.json({ ok: true, recordings: list });
  });

  router.get(
    '/:id/recordings/:rid/video',
    allow('public'),
    steps.configured,
    enabled,
    steps.loadCall,
    loadRecording,
    (req, res) => {
      res.set('Cache-Control', 'private, no-store');
      res.type('video/mp4');
      // sendFile answers range requests: a player can seek without loading the whole file.
      res.sendFile(path.join(recording.dir, req.recording.file), (err) => {
        if (err && !res.headersSent) sendError(res, 404, 'not_found', 'The file is missing.');
      });
    }
  );

  router.delete('/:id/recordings/:rid', ...manage, loadRecording, (req, res) => {
    rmSync(path.join(recording.dir, req.recording.file), { force: true });
    deleteRecordingRow(db, req.recording.id);
    audit(req, 'call.recording_delete', req.call);
    res.json({ ok: true });
  });

  return router;
}
