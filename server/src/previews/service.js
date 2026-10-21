// ============================================================
// File:        service.js
// Path:        server/src/previews/service.js
// Project:     Seasonal Entertainment
// Description: Link previews for the chat (decided 2026-10-17): after a member's message text
//              is stored, the server previews its first https link and pushes the card to the
//              room. Cached per URL (config: cacheHours), one fetch per URL at a time, limited
//              per user and overall; can be switched off (LINK_PREVIEWS=false). Failures are
//              silent: the message simply has no card (the log names only the link's host).
// ============================================================

import { firstHttpsLink } from '@seasonal-entertainment/shared/chatRules.js';
import { findMessage } from '../chat/messages.js';
import { makeWindowLimit } from '../chat/senderLimit.js';
import { deleteMediaFile } from '../media/files.js';
import { fetchPreview } from './fetchPreview.js';
import { realNetwork } from './safeFetch.js';
import { findPreview, savePreview, setMessagePreview } from './store.js';

const HOUR_MS = 60 * 60 * 1000;

// network: safeFetch's network (tests replace it; no real internet there).
export function createPreviewService(db, config, hub, network = realNetwork) {
  const settings = config.linkPreviews;
  const perUser = makeWindowLimit(settings.perUser);
  const overall = makeWindowLimit(settings.overall);
  const inFlight = new Map(); // url -> promise of its saved preview

  async function previewFor(url, userId) {
    const cached = findPreview(db, url);
    if (cached && Date.now() - Date.parse(cached.fetchedAt) < settings.cacheHours * HOUR_MS) {
      return cached;
    }
    if (inFlight.has(url)) return inFlight.get(url);
    // A fetch refused by a limit is not cached: the next message may get the card.
    if (!perUser(`user:${userId}`) || !overall('all')) return null;
    const job = fetchPreview(url, config, network)
      .catch(() => null)
      .then((data) => {
        const { preview, oldFile } = savePreview(db, url, data);
        if (oldFile) deleteMediaFile(config, oldFile);
        return preview;
      })
      .finally(() => inFlight.delete(url));
    inFlight.set(url, job);
    return job;
  }

  // Never throws and is not awaited by the route: the message is already posted.
  async function attach(message, viewer) {
    if (!settings.enabled || !viewer.user || !message.body) return;
    const url = firstHttpsLink(message.body);
    if (!url) return;
    try {
      const preview = await previewFor(url, viewer.user.id);
      if (!preview?.ok) return;
      setMessagePreview(db, message.id, preview.id);
      // As every reader sees it (a message reported meanwhile shows no card).
      const shown = findMessage(db, message.id);
      if (shown.preview && !shown.hiddenAt) {
        hub.broadcast(shown.roomId, { type: 'preview', id: shown.id, preview: shown.preview });
      }
    } catch (err) {
      // The host only: a link's path or query may carry someone's token.
      console.warn(`[previews] ${URL.parse(url)?.host ?? 'a link'}: ${err.message}`);
    }
  }

  return { attach };
}
