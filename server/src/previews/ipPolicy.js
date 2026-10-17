// ============================================================
// File:        ipPolicy.js
// Path:        server/src/previews/ipPolicy.js
// Project:     Seasonal Entertainment
// Description: Which addresses the link-preview fetcher may connect to: public unicast only.
//              Private, loopback, link-local (cloud metadata), carrier-grade NAT, multicast,
//              reserved and documentation ranges are refused, and in IPv6 also unique-local,
//              IPv4-mapped and the translation / tunnel prefixes that can wrap an IPv4 address.
// ============================================================

import net from 'node:net';

const IPV4_REFUSED = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (cloud metadata at 169.254.169.254)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, and 255.255.255.255
];

const IPV6_REFUSED = [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['::ffff:0:0', 96], // IPv4-mapped
  ['64:ff9b::', 96], // NAT64
  ['64:ff9b:1::', 48], // local NAT64
  ['100::', 64], // discard
  ['2001::', 23], // IETF protocol assignments (Teredo among them)
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4
  ['fc00::', 7], // unique-local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // old site-local
  ['ff00::', 8], // multicast
];

// Two lists on purpose: a BlockList applies its IPv6 rule ::ffff:0:0/96 to every IPv4
// address, so one shared list would refuse the whole IPv4 internet.
function blockList(ranges, type) {
  const list = new net.BlockList();
  for (const [address, prefix] of ranges) list.addSubnet(address, prefix, type);
  return list;
}
const REFUSED_V4 = blockList(IPV4_REFUSED, 'ipv4');
const REFUSED_V6 = blockList(IPV6_REFUSED, 'ipv6');

export function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return !REFUSED_V4.check(address, 'ipv4');
  if (family === 6) return !REFUSED_V6.check(address, 'ipv6');
  return false;
}
