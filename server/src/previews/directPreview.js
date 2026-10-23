// ============================================================
// File:        directPreview.js
// Path:        server/src/previews/directPreview.js
// Project:     Seasonal Entertainment
// Description: Link previews for direct messages (docs/CHAT.md, "Link previews in direct
//              messages", decided 2026-10-22): POST /api/chat/direct/preview { url } fetches one
//              https link through the room previews' fetcher (fetchPreview.js, safeFetch's
//              network guard) and answers the card: title, description, site name and an
//              optional image re-encoded small (at most 320px wide and 50 KB, WebP, as a data
//              URL). The sender's browser puts the card inside the encrypted message, so the
//              recipient's browser never contacts the linked site. Nothing is stored (no cache
//              row, no file, no database write), nothing is logged, and nothing records which
//              account asked for which link: only the per-account rate-limit counter.
// ============================================================

import express from 'express';
import sharp from 'sharp';
import { firstHttpsLink } from '@seasonal-entertainment/shared/chatRules.js';
import { makeWindowLimit } from '../chat/senderLimit.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { validBody } from '../http/validate.js';
import { fetchPreview } from './fetchPreview.js';
import { realNetwork } from './safeFetch.js';

const DIRECT_IMAGE = { maxWidth: 320, maxBytes: 50 * 1024 };
// Tried in turn until the image fits the byte limit: lower quality first, then narrower;
// when nothing fits, the card goes without its image.
const QUALITIES = [80, 60, 40];
const WIDTHS = [320, 240, 160];

// The image as a data URL of at most DIRECT_IMAGE.maxBytes, or null when it cannot get there.
async function smallImage(data) {
  for (const width of WIDTHS) {
    for (const quality of QUALITIES) {
      const webp = await sharp(data)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();
      if (webp.length <= DIRECT_IMAGE.maxBytes) {
        return `data:image/webp;base64,${webp.toString('base64')}`;
      }
    }
  }
  return null;
}

// network: safeFetch's network (tests replace it; no real internet there).
export function directPreviewRoutes(config, network = realNetwork) {
  const router = express.Router();
  const settings = config.linkPreviews;
  // Counters only, keyed by account: no link is kept.
  const perUser = makeWindowLimit(settings.perUser);
  const overall = makeWindowLimit(settings.overall);

  router.post('/preview', allow('member'), async (req, res) => {
    const input = validBody(req, res, {
      url: (v) => (typeof v === 'string' && firstHttpsLink(v) === v ? null : 'Not an https link.'),
    });
    if (!input) return;
    if (!settings.enabled || req.user.dmLinkPreviews === false) {
      return sendError(res, 403, 'previews_off', 'Link previews are switched off.');
    }
    if (!perUser(`user:${req.user.id}`) || !overall('all')) {
      return sendError(res, 429, 'rate_limited', 'Too many previews at once. Try again later.');
    }
    // A failure is no card, and is not logged: even a host would say which site was linked.
    const found = await fetchPreview(input.url, config, network, {
      maxWidth: DIRECT_IMAGE.maxWidth,
      keep: async ({ data }) => smallImage(data),
    }).catch(() => null);
    if (!found) return res.json({ ok: true, preview: null });
    res.json({
      ok: true,
      preview: {
        url: input.url,
        title: found.title,
        description: found.description,
        siteName: found.siteName,
        image: found.image,
      },
    });
  });

  return router;
}
