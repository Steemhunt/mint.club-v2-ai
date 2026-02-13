import { formatUnits, parseUnits, type Address } from 'viem';

export const fmt = (v: bigint, decimals = 18) => formatUnits(v, decimals);
export const parse = (v: string, decimals = 18) => parseUnits(v, decimals);
export const shortAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;
export const shortHash = (h: string) => `${h.slice(0, 10)}...${h.slice(-8)}`;

export function parseSteps(input: string): { ranges: bigint[]; prices: bigint[] } {
  const ranges: bigint[] = [];
  const prices: bigint[] = [];

  for (const step of input.split(',')) {
    const [r, p] = step.trim().split(':');
    if (!r || !p) throw new Error(`Invalid step: "${step}". Expected "range:price"`);
    ranges.push(parse(r));
    prices.push(parse(p));
  }

  return { ranges, prices };
}

export function printTokenInfo(t: {
  name: string; symbol: string; address: string; creator: string;
  reserveToken: string; reserveBalance: bigint; currentSupply: bigint;
  maxSupply: bigint; mintRoyalty: number; burnRoyalty: number;
  createdAt: number; steps: readonly { rangeTo: bigint; price: bigint }[];
}) {
  console.log([
    `\n🪙 Token: ${t.name} (${t.symbol})`,
    `📍 Address: ${t.address}`,
    `👤 Creator: ${shortAddr(t.creator)}`,
    `💰 Reserve Token: ${shortAddr(t.reserveToken)}`,
    `💎 Reserve Balance: ${fmt(t.reserveBalance)}`,
    `📊 Supply: ${fmt(t.currentSupply)} / ${fmt(t.maxSupply)}`,
    `💸 Mint Royalty: ${(t.mintRoyalty / 100).toFixed(2)}%`,
    `🔥 Burn Royalty: ${(t.burnRoyalty / 100).toFixed(2)}%`,
    `📅 Created: ${new Date(t.createdAt * 1000).toLocaleString()}`,
  ].join('\n'));

  if (t.steps.length > 0) {
    const first = t.steps[0];
    const last = t.steps[t.steps.length - 1];
    const firstPrice = Number(first.price) / 1e18;
    const lastPrice = Number(last.price) / 1e18;
    const increase = firstPrice > 0 ? ((lastPrice / firstPrice - 1) * 100).toFixed(0) : '∞';
    console.log(`📈 Bonding Curve: ${t.steps.length} steps, ${fmt(first.price)} → ${fmt(last.price)} per token (+${increase}%)`);
  }
}
