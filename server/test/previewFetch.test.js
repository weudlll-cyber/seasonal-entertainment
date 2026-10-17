// ============================================================
// File:        previewFetch.test.js
// Path:        server/test/previewFetch.test.js
// Project:     Seasonal Entertainment
// Description: Guards safeFetch against server-side request forgery on a pretend internet:
//              https and port 443 only; private, loopback, link-local, CGNAT, unique-local and
//              IPv4-mapped targets refused, also when DNS answers them or a redirect leads
//              there; one lookup per hop and a connection to exactly that address; at most 3
//              redirects; size cap, deadline, content type; fixed User-Agent, no cookies.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { FetchRefused, safeFetch } from '../src/previews/safeFetch.js';
import { PUBLIC_IP, html, previewInternet, redirect } from './helpers/previewNet.js';

let internet;
afterEach(() => internet?.close());

const OPTIONS = {
  accept: ['text/html'],
  maxBytes: 1024,
  timeoutMs: 1000,
  maxRedirects: 3,
  userAgent: 'TestPreview/1.0',
};

const DNS = {
  'site.test': [PUBLIC_IP],
  'private.test': ['10.0.0.5'],
  'loopback.test': ['127.0.0.1'],
  'metadata.test': ['169.254.169.254'],
  'cgnat.test': ['100.64.0.7'],
  'ula.test': ['fd00::1'],
  'mapped.test': ['::ffff:127.0.0.1'],
  'mixed.test': [PUBLIC_IP, '192.168.1.1'],
};

async function start(routes = {}) {
  internet = await previewInternet(
    {
      'site.test/page': html('<title>ok</title>'),
      'site.test/to-private': redirect('https://private.test/'),
      'site.test/to-loopback-literal': redirect('https://127.0.0.1/'),
      'site.test/to-http': redirect('http://site.test/page'),
      'site.test/to-port': redirect('https://site.test:8443/page'),
      'site.test/hop1': redirect('/hop2'),
      'site.test/hop2': redirect('/hop3'),
      'site.test/hop3': redirect('/hop4'),
      'site.test/hop4': redirect('/page'),
      ...routes,
    },
    DNS
  );
  return (url, options) => safeFetch(url, { ...OPTIONS, ...options }, internet.network);
}

describe('allowed', () => {
  it('fetches a public https page: one lookup, the connection goes to that address', async () => {
    const fetch = await start();
    const res = await fetch('https://site.test/page');
    expect(res).toMatchObject({ status: 200, contentType: 'text/html' });
    expect(res.body.toString()).toBe('<title>ok</title>');
    expect(internet.lookups).toEqual(['site.test']);
    expect(internet.dialled).toEqual([PUBLIC_IP]);
  });

  it('sends a fixed User-Agent and no cookies', async () => {
    const fetch = await start();
    await fetch('https://site.test/page');
    const { headers } = internet.requests[0];
    expect(headers['user-agent']).toBe('TestPreview/1.0');
    expect(headers.cookie).toBeUndefined();
    expect(headers.authorization).toBeUndefined();
  });

  it('follows up to 3 redirects, each checked again', async () => {
    const fetch = await start();
    await expect(fetch('https://site.test/hop2')).resolves.toMatchObject({ status: 200 });
    await expect(fetch('https://site.test/hop1')).rejects.toThrow(/too many redirects/);
  });
});

describe('refused targets', () => {
  const refused = async (fetch, url) => {
    await expect(fetch(url)).rejects.toBeInstanceOf(FetchRefused);
  };

  it('not https, not port 443, or credentials in the URL', async () => {
    const fetch = await start();
    await refused(fetch, 'http://site.test/page');
    await refused(fetch, 'https://site.test:8443/page');
    await refused(fetch, 'https://user:pw@site.test/page');
    expect(internet.dialled).toEqual([]);
  });

  it('DNS answering a private, loopback, link-local, CGNAT, unique-local or mapped address', async () => {
    const fetch = await start();
    for (const host of ['private', 'loopback', 'metadata', 'cgnat', 'ula', 'mapped', 'mixed']) {
      await refused(fetch, `https://${host}.test/`);
    }
    expect(internet.dialled).toEqual([]);
  });

  it('address literals', async () => {
    const fetch = await start();
    for (const host of ['127.0.0.1', '[::1]', '[fe80::1]', '2130706433', '0x7f.1', '10.1.1.1']) {
      await refused(fetch, `https://${host}/`);
    }
    expect(internet.dialled).toEqual([]);
  });

  it('a redirect to a private target, to plain http or to another port', async () => {
    const fetch = await start();
    await refused(fetch, 'https://site.test/to-private');
    await refused(fetch, 'https://site.test/to-loopback-literal');
    await refused(fetch, 'https://site.test/to-http');
    await refused(fetch, 'https://site.test/to-port');
    expect(internet.dialled).toEqual([PUBLIC_IP, PUBLIC_IP, PUBLIC_IP, PUBLIC_IP]);
  });
});

describe('limits', () => {
  it('a body over the cap is aborted, with or without Content-Length', async () => {
    const big = 'x'.repeat(5000);
    const fetch = await start({
      'site.test/big': html(big),
      'site.test/streamed': (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.write(big);
        res.end(big);
      },
    });
    await expect(fetch('https://site.test/big')).rejects.toThrow(/too large/);
    await expect(fetch('https://site.test/streamed')).rejects.toThrow(/too large/);
  });

  it('a slow answer is given up at the deadline', async () => {
    const fetch = await start({ 'site.test/slow': () => {} });
    const started = Date.now();
    await expect(fetch('https://site.test/slow', { timeoutMs: 300 })).rejects.toBeInstanceOf(
      FetchRefused
    );
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('only the accepted content types', async () => {
    const fetch = await start({
      'site.test/file': (_req, res) => {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.end('data');
      },
    });
    await expect(fetch('https://site.test/file')).rejects.toThrow(/content type/);
  });
});
