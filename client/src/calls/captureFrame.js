// ============================================================
// File:        captureFrame.js
// Path:        client/src/calls/captureFrame.js
// Project:     Seasonal Entertainment
// Description: The frame a <video> shows right now, as a JPEG file for upload (a recording's
//              preview image, RecordingPreviewPicker.jsx; docs/CALLS.md, "A recording's preview
//              image"). Drawn at the video's own size into a canvas; the recording streams from
//              this site, so the canvas is never "tainted" and can be read.
// ============================================================

const QUALITY = 0.9;

// Resolves to a Blob (image/jpeg); rejects when the video has no picture yet or the browser
// gives none.
export function captureFrame(video) {
  return new Promise((resolve, reject) => {
    const { videoWidth: width, videoHeight: height } = video;
    if (!width || !height) {
      reject(new Error('The video has no picture yet. Wait a moment and try again.'));
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(video, 0, 0, width, height);
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('This frame could not be taken.'))),
      'image/jpeg',
      QUALITY
    );
  });
}
