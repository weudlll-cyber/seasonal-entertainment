// ============================================================
// File:        recordingPreview.test.jsx
// Path:        client/src/calls/recordingPreview.test.jsx
// Project:     Seasonal Entertainment
// Description: Choosing a recording's preview image (RecordingPreviewPicker, captureFrame;
//              docs/CALLS.md, "A recording's preview image"): only organisers and admins see the
//              picker on the recording's page; the slider moves the video; "Use this frame"
//              draws the shown frame into a JPEG and uploads it; "Upload an image" sends the
//              chosen file; "Back to the logo" removes it; a video without a picture yet says
//              so; the player shows the chosen image before it plays.
// ============================================================

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';

const PREVIEW = {
  full: '/api/calls/recordings/5/preview/full?v=1',
  thumb: '/api/calls/recordings/5/preview/thumb?v=1',
};
const recording = (preview = null) => ({
  id: 5,
  callId: 12,
  title: 'AMA with the team',
  startedAt: '2026-10-22T18:00:00Z',
  seconds: 1800,
  chapters: [],
  preview,
});
const ADDRESS = '/calls/12/recordings/5/preview';
const page = (canManage, preview) => ({
  ...GUEST,
  'GET /calls/recordings/5': { body: { ok: true, canManage, recording: recording(preview) } },
  [`POST ${ADDRESS}?`]: { status: 201, body: { ok: true } },
  [`DELETE ${ADDRESS}`]: { body: { ok: true } },
});
const picker = () => screen.findByRole('region', { name: 'Preview image' });
const frameVideo = () => screen.getByLabelText('The frame to use');

let drawImage;
beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  // jsdom draws nothing: a canvas whose context records the call and gives a JPEG back.
  drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(done, type) {
    done(new Blob(['frame'], { type }));
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// The video's own picture size, as a loaded video has it (jsdom's are 0).
function pictureSize(video, width, height) {
  Object.defineProperty(video, 'videoWidth', { configurable: true, value: width });
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: height });
}

describe('who sees it', () => {
  it('not a member or guest: the page shows the recording without the picker', async () => {
    mockApi(page(false));
    await renderApp('/recordings/5');
    await screen.findByRole('list', { name: 'Recording' });
    expect(screen.queryByRole('region', { name: 'Preview image' })).toBeNull();
  });
});

describe('choosing', () => {
  it('the slider moves the video; "Use this frame" uploads that frame as a JPEG', async () => {
    const calls = mockApi(page(true));
    await renderApp('/recordings/5');
    const region = await picker();
    expect(within(region).getByText('The site’s logo')).toBeInTheDocument();
    const video = frameVideo();
    pictureSize(video, 1280, 720);
    fireEvent.change(within(region).getByRole('slider'), { target: { value: '754' } });
    expect(video.currentTime).toBe(754);
    expect(within(region).getByText('Frame at 12:34')).toBeInTheDocument();

    fireEvent.click(within(region).getByRole('button', { name: 'Use this frame' }));
    expect(await within(region).findByRole('status')).toHaveTextContent(
      'This frame is now the preview image.'
    );
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1280, 720);
    const sent = calls.find((c) => c.key === `POST ${ADDRESS}?`);
    expect(sent.body).toBeInstanceOf(Blob);
    expect(sent.body.type).toBe('image/jpeg');
    // The page reloads the recording, so the new image shows.
    expect(calls.filter((c) => c.key === 'GET /calls/recordings/5')).toHaveLength(2);
  });

  it('a video without a picture yet says so and sends nothing', async () => {
    const calls = mockApi(page(true));
    await renderApp('/recordings/5');
    const region = await picker();
    fireEvent.click(within(region).getByRole('button', { name: 'Use this frame' }));
    expect(await within(region).findByRole('alert')).toHaveTextContent(
      'The video has no picture yet.'
    );
    expect(calls.some((c) => c.key.startsWith('POST'))).toBe(false);
  });

  it('"Upload an image" sends the chosen file', async () => {
    const calls = mockApi(page(true));
    await renderApp('/recordings/5');
    const region = await picker();
    const image = new File(['png'], 'cover.png', { type: 'image/png' });
    fireEvent.change(within(region).getByLabelText('Image file'), { target: { files: [image] } });
    expect(await within(region).findByRole('status')).toHaveTextContent(
      'The image is now the preview.'
    );
    expect(calls.find((c) => c.key === `POST ${ADDRESS}?`).body).toBe(image);
  });

  it('with a chosen image: it is shown, the player starts on it, "Back to the logo"', async () => {
    const calls = mockApi(page(true, PREVIEW));
    await renderApp('/recordings/5');
    const region = await picker();
    expect(within(region).getByText('The chosen image')).toBeInTheDocument();
    expect(region.querySelector('img')).toHaveAttribute('src', PREVIEW.thumb);
    expect(screen.getByLabelText(/^Recording of /)).toHaveAttribute('poster', PREVIEW.full);

    fireEvent.click(within(region).getByRole('button', { name: 'Back to the logo' }));
    await waitFor(() => expect(calls.some((c) => c.key === `DELETE ${ADDRESS}`)).toBe(true));
    expect(await within(region).findByRole('status')).toHaveTextContent(
      'The preview is the site’s logo again.'
    );
  });
});
