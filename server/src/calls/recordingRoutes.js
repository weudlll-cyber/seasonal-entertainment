// ============================================================
// File:        recordingRoutes.js
// Path:        server/src/calls/recordingRoutes.js
// Project:     Seasonal Entertainment
// Description: Call recording (docs/CALLS.md, "Recording", decided 2026-10-22), on only when
//              recording is configured (config.calls.recording). Organisers and admins start and
//              stop the recording of a live call (one at a time; audited); the room's metadata
//              then says a recording runs (roomState.js), which every client shows. Ending the
//              call stops it (endCall.js). The recordings of a call are listed, and played
//              (with range requests, so a player can seek), for the same audience as the call
//              itself; organisers and admins delete one (file and row). Nothing is deleted
//              automatically.
// ============================================================

import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { callSteps } from './middleware.js';
import {
  activeRecording,
  addRecording,
  deleteRecordingRow,
  findRecording,
  listRecordings,
  markRecordingStopped,
} from './recordings.js';
import { publishRoomState } from './roomState.js';

// Stops the call's running recording, if any: the egress, then its row, then the room says so.
// Used by the stop route and by endCall.js (where the room is closed right after).
export async function stopCallRecording(db, service, call) {
  const running = activeRecording(db, call.id);
  if (!running) return false;
  await service.stopRecording(running.egressId);
  return markRecordingStopped(db, running.id);
}

export function callRecordingRoutes(db, config, service) {
  const router = express.Router();
  const steps = callSteps(db, config, service);
  const recording = config.calls?.recording ?? null;
  // The egress writes into it: it must exist before the first recording.
  if (recording) mkdirSync(recording.dir, { recursive: true });
  const enabled = (_req, res, next) =>
    recording ? next() : sendError(res, 404, 'recording_off', 'Recording is not set up.');
  const audit = (req, action, call) =>
    recordAudit(db, req.user, {
      action,
      targetType: 'call',
      targetId: call.id,
      after: { title: call.title },
    });
  const manage = [allow('organiser'), steps.configured, enabled, steps.loadCall, steps.perUser];

  router.post('/:id/recording/start', ...manage, steps.live, async (req, res) => {
    if (activeRecording(db, req.call.id)) {
      return sendError(res, 409, 'recording_running', 'This call is being recorded already.');
    }
    const file = `call-${req.call.id}-${Date.now()}-${randomBytes(4).toString('hex')}.mp4`;
    const egressId = await service.startRecording(req.call.roomName, file);
    addRecording(db, { callId: req.call.id, egressId, file, startedBy: req.user.username });
    await publishRoomState(db, service, req.call);
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

  const loadRecording = (req, res, next) => {
    const found = findRecording(db, req.call.id, Number.parseInt(req.params.rid, 10));
    if (!found?.stoppedAt) return sendError(res, 404, 'not_found', 'No such recording.');
    req.recording = found;
    next();
  };

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
