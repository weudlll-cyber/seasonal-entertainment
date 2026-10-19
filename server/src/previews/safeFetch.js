// ============================================================
// File:        safeFetch.js
// Path:        server/src/previews/safeFetch.js
// Project:     Seasonal Entertainment
// Description: The only way the server fetches from the internet (link previews), built
//              against server-side request forgery: https on port 443 only, no credentials in
//              the URL; DNS is resolved here once and every answer must be a public address
//              (ipPolicy.js); the connection goes to that resolved address (no second lookup),
//              with the TLS certificate checked against the host name; at most a few redirects,
//              each checked the same way; one deadline for everything; a body cap; a fixed
//              User-Agent, no cookies.
// ============================================================

import dns from 'node:dns/promises';
import http from 'node:http';
import net from 'node:net';
import tls from 'node:tls';
import { isPublicAddress } from './ipPolicy.js';

export class FetchRefused extends Error {}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

// The network: replaceable in tests (they answer DNS themselves and dial a local server).
export const realNetwork = {
  resolve: async (host) =>
    (await dns.lookup(host, { all: true, verbatim: true })).map((a) => a.address),
  connect: ({ address, servername }) =>
    tls.connect({ host: address, port: 443, servername, ALPNProtocols: ['http/1.1'] }),
};

function checkUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new FetchRefused('not a URL');
  }
  if (url.protocol !== 'https:') throw new FetchRefused('https only');
  if (url.port !== '' && url.port !== '443') throw new FetchRefused('port 443 only');
  if (url.username || url.password) throw new FetchRefused('no credentials in URLs');
  return url;
}

const bareHost = (url) => url.hostname.replace(/^\[|\]$/g, '');

// A slow DNS answer counts against the same deadline as the rest.
function beforeDeadline(promise, signal) {
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      const stop = () => reject(new FetchRefused('timed out'));
      if (signal.aborted) stop();
      signal.addEventListener('abort', stop, { once: true });
    }),
  ]);
}

// Every address the name resolves to must be public; the first one is used.
async function resolvePublic(host, network, signal) {
  const addresses = net.isIP(host) ? [host] : await beforeDeadline(network.resolve(host), signal);
  if (addresses.length === 0) throw new FetchRefused('no address');
  if (!addresses.every(isPublicAddress)) throw new FetchRefused('address not allowed');
  return addresses[0];
}

// One GET to one already-checked address. Resolves { status, location } for a redirect, else
// { status, contentType, body }.
function requestOnce(url, address, options, network, signal) {
  return new Promise((resolve, reject) => {
    const host = bareHost(url);
    const socket = network.connect({ address, servername: net.isIP(host) ? undefined : host });
    const req = http.request({
      method: 'GET',
      path: `${url.pathname}${url.search}`,
      headers: {
        Host: url.host,
        'User-Agent': options.userAgent,
        Accept: options.accept.join(', '),
        'Accept-Encoding': 'identity',
      },
      createConnection: () => socket,
      signal,
    });
    req.on('error', (err) =>
      reject(err instanceof FetchRefused ? err : new FetchRefused(err.message))
    );
    req.on('response', (res) => {
      const fail = (reason) => {
        req.destroy(new FetchRefused(reason));
      };
      if (REDIRECTS.has(res.statusCode)) {
        res.resume();
        resolve({ status: res.statusCode, location: res.headers.location });
        return req.destroy();
      }
      const contentType = (res.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (!options.accept.some((type) => contentType.startsWith(type))) {
        return fail(`content type ${contentType || 'missing'}`);
      }
      if (Number(res.headers['content-length']) > options.maxBytes) return fail('too large');
      readBody(res, options.maxBytes, () => fail('too large')).then(
        (body) => resolve({ status: res.statusCode, contentType, body }),
        reject
      );
    });
    req.end();
  });
}

// The body of a response, at most maxBytes. Over that, onTooLarge() stops the transfer and the
// promise rejects — also when the end arrives before the transfer has stopped (the last
// chunks may all be in already): a cut-off body is never handed over as if complete.
export function readBody(res, maxBytes, onTooLarge) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    res.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) return onTooLarge();
      chunks.push(chunk);
    });
    res.on('end', () =>
      size > maxBytes ? reject(new FetchRefused('too large')) : resolve(Buffer.concat(chunks))
    );
    res.on('error', (err) => reject(new FetchRefused(err.message)));
  });
}

// options: { accept: ['text/html'], maxBytes, maxRedirects, userAgent, and signal (a deadline
// shared with other fetches) or timeoutMs }.
// Resolves { status, contentType, body, url } (url: the final address after redirects);
// throws FetchRefused for anything not allowed or not finished in time.
export async function safeFetch(input, options, network = realNetwork) {
  const signal = options.signal ?? AbortSignal.timeout(options.timeoutMs);
  let url = checkUrl(input);
  for (let redirects = 0; ; redirects++) {
    const address = await resolvePublic(bareHost(url), network, signal);
    const res = await requestOnce(url, address, options, network, signal);
    if (!REDIRECTS.has(res.status)) return { ...res, url: url.href };
    if (redirects >= options.maxRedirects) throw new FetchRefused('too many redirects');
    if (!res.location) throw new FetchRefused('redirect without a location');
    url = checkUrl(new URL(res.location, url));
  }
}
