// ============================================================
// File:        parseMeta.js
// Path:        server/src/previews/parseMeta.js
// Project:     Seasonal Entertainment
// Description: Reads a link preview out of an HTML page: Open Graph first, then Twitter-card
//              tags, then <title> and the description meta tag. Everything comes back as
//              plain text (entities decoded, whitespace collapsed, control characters dropped,
//              length-capped), never HTML; the image only as an absolute https URL.
// ============================================================

import { Parser } from 'htmlparser2';

// The first of these keys that is present wins.
const FIELDS = {
  title: ['og:title', 'twitter:title'],
  description: ['og:description', 'twitter:description', 'description'],
  siteName: ['og:site_name'],
  image: ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'],
};

// C0 and C1 control characters (tabs and newlines included) become spaces.
const isControl = (char) => {
  const code = char.codePointAt(0);
  return code < 0x20 || (code >= 0x7f && code <= 0x9f);
};

function plainText(value, max) {
  const text = [...String(value ?? '')]
    .map((char) => (isControl(char) ? ' ' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function httpsUrl(value, base) {
  try {
    const url = new URL(value, base);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

// limits: { titleMax, descriptionMax, siteNameMax }. pageUrl: for relative image paths.
export function parseMeta(html, pageUrl, limits) {
  const meta = new Map();
  let title = '';
  let inTitle = false;
  const parser = new Parser(
    {
      onopentag(name, attrs) {
        if (name === 'title') inTitle = true;
        if (name !== 'meta') return;
        const key = (attrs.property ?? attrs.name ?? '').toLowerCase();
        if (key && attrs.content !== undefined && !meta.has(key)) meta.set(key, attrs.content);
      },
      ontext(text) {
        if (inTitle) title += text;
      },
      onclosetag(name) {
        if (name === 'title') inTitle = false;
      },
    },
    { decodeEntities: true }
  );
  parser.write(html);
  parser.end();
  const first = (keys) => keys.map((key) => meta.get(key)).find((value) => value?.trim());
  const image = first(FIELDS.image);
  return {
    title: plainText(first(FIELDS.title) ?? title, limits.titleMax),
    description: plainText(first(FIELDS.description), limits.descriptionMax),
    siteName: plainText(first(FIELDS.siteName), limits.siteNameMax),
    image: image ? httpsUrl(image.trim(), pageUrl) : null,
  };
}
