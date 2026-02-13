import { http, fallback } from 'viem';
import { base } from 'viem/chains';

export const CHAIN = base;

const RPCS = [
  'https://base-rpc.publicnode.com',
  'https://base.meowrpc.com',
  'https://mainnet.base.org',
  'https://developer-access-mainnet.base.org',
  'https://base-mainnet.public.blastapi.io',
  'https://base-public.nodies.app',
  'https://1rpc.io/base',
];

export function getTransport() {
  return fallback(
    RPCS.map(url => http(url, { retryCount: 0, timeout: 2_000, batch: true })),
    { rank: false },
  );
}
