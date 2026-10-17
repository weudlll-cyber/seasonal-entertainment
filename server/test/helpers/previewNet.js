// ============================================================
// File:        previewNet.js
// Path:        server/test/helpers/previewNet.js
// Project:     Seasonal Entertainment
// Description: A pretend internet for link-preview tests (no real network): DNS answers come
//              from a table, and every connection goes to one local plain-HTTP server that
//              answers per "host/path". It records each dialled address and each request, so
//              tests can prove what was (not) contacted. Only the TLS layer differs from
//              production (safeFetch's realNetwork uses tls.connect with certificate checks).
// ============================================================

import http from 'node:http';
import net from 'node:net';

export const PUBLIC_IP = '93.184.216.34';

// routes: { 'site.test/page': (req, res) => ... }; dns: { 'site.test': ['93.184.216.34'] }.
export async function previewInternet(routes, dns) {
  const requests = [];
  const dialled = [];
  const lookups = [];
  const server = http.createServer((req, res) => {
    const key = `${req.headers.host}${req.url}`;
    requests.push({ key, headers: req.headers });
    const handler = routes[key];
    if (!handler) {
      res.statusCode = 404;
      return res.end();
    }
    handler(req, res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const network = {
    resolve: async (host) => {
      lookups.push(host);
      if (!dns[host]) throw new Error(`getaddrinfo ENOTFOUND ${host}`);
      return dns[host];
    },
    connect: ({ address }) => {
      dialled.push(address);
      return net.connect(server.address().port, '127.0.0.1');
    },
  };
  return {
    network,
    requests,
    dialled,
    lookups,
    hits: (key) => requests.filter((r) => r.key === key).length,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}

export const html = (body) => (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(body);
};

export const redirect = (location) => (_req, res) => {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
};
