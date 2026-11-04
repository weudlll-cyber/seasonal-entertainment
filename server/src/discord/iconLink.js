// ============================================================
// File:        iconLink.js
// Path:        server/src/discord/iconLink.js
// Project:     Seasonal Entertainment
// Description: "Icon from link" (Admin -> Discord steps; docs/AUTH.md, "Discord: steps"): an
//              admin pastes the link of a role icon on Discord's image servers, and the server
//              fetches it once. Only https links to exactly cdn.discordapp.com or
//              media.discordapp.net; through the chat handle's images.download (safeFetch,
//              previews/safeFetch.js: public addresses only, one deadline, a body cap), here with
//              no redirect at all, 10 seconds, only an image type, and the transfer cut at the
//              icon limit (images.iconLimit, media/icons.js: an upload's limit and message). The
//              bytes then go through the icon pipeline every upload takes (media/icons.js, via
//              the chat handle's images.storeIcon), so afterwards nothing depends on Discord.
// ============================================================

export const ICON_LINK_HOSTS = ['cdn.discordapp.com', 'media.discordapp.net'];
export const ICON_LINK_TIMEOUT_MS = 10_000;
const USER_AGENT = 'SeasonalEntertainmentIcons/1.0 (step icons for Seasonal Entertainment)';

// A message for the admin.
export class IconLinkError extends Error {}

const WRONG_HOST = `Only https links to ${ICON_LINK_HOSTS.join(' or ')} are accepted.`;

function checkLink(input) {
  let url;
  try {
    url = new URL(String(input).trim());
  } catch {
    throw new IconLinkError(WRONG_HOST);
  }
  // Exactly these hosts: no subdomain, no look-alike, no other port.
  if (url.protocol !== 'https:' || !ICON_LINK_HOSTS.includes(url.hostname) || url.port) {
    throw new IconLinkError(WRONG_HOST);
  }
  return url;
}

// safeFetch's reasons, in words for the admin; too large: what an oversized upload is told.
function explain(reason, iconLimit) {
  if (reason === 'too large') return iconLimit.message;
  if (reason.startsWith('content type')) return 'The link does not lead to an image.';
  // maxRedirects 0: any redirect, to this host or another, is refused.
  if (reason === 'too many redirects') {
    return 'The link redirects elsewhere. Use the image’s direct link.';
  }
  return 'The image could not be fetched: the link is unreachable or did not answer in time.';
}

// Resolves the image's bytes; throws IconLinkError. images: the chat handle's (download and
// iconLimit); network: safeFetch's (tests pass a pretend internet; undefined means the real one).
export async function fetchIconLink(input, images, network) {
  const url = checkLink(input);
  const res = await images.download(
    url.href,
    {
      accept: ['image/'],
      maxBytes: images.iconLimit.bytes,
      maxRedirects: 0,
      timeoutMs: ICON_LINK_TIMEOUT_MS,
      userAgent: USER_AGENT,
    },
    network
  );
  if (!res.ok) throw new IconLinkError(explain(res.reason, images.iconLimit));
  if (res.status !== 200) {
    throw new IconLinkError(`The image could not be fetched: Discord answered ${res.status}.`);
  }
  return res.body;
}
