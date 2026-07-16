import { formatUnits, parseUnits, type Address } from 'viem';
import { CHAIN_CONFIGS, type SupportedChain } from '../config/chains';

export const fmt = (v: bigint, decimals = 18) => formatUnits(v, decimals);
export function parse(value: string, decimals = 18): bigint {
  const normalized = value.trim();
  const match = /^-?(?:\d+(?:\.(\d*))?|\.(\d+))$/.exec(normalized);
  const fractionalDigits = (match?.[1] ?? match?.[2] ?? '').replace(/0+$/, '');
  if (fractionalDigits.length > decimals) {
    if (decimals === 0) {
      throw new Error('Amount must be a whole number');
    }
    throw new Error(`Amount has more than ${decimals} decimal places`);
  }
  return parseUnits(normalized, decimals);
}

export function parseTokenAmount(value: string, decimals: number): bigint {
  return parse(value, decimals);
}
export const shortAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;
export const shortHash = (h: string) => h; // show full hash
export const txUrl = (h: string, chain: SupportedChain = 'base') => {
  const explorer = CHAIN_CONFIGS[chain].chain.blockExplorers?.default.url;
  return explorer ? `${explorer}/tx/${h}` : h;
};

export function parseSteps(
  input: string,
  priceDecimals = 18,
): { ranges: bigint[]; prices: bigint[] } {
  const ranges: bigint[] = [];
  const prices: bigint[] = [];

  for (const step of input.split(',')) {
    const [r, p] = step.trim().split(':');
    if (!r || !p) {
      throw new Error(`Invalid step: "${step}". Expected "range:price"`);
    }
    ranges.push(parse(r));
    prices.push(parse(p, priceDecimals));
  }

  return { ranges, prices };
}

export function printTokenInfo(t: {
  name: string;
  symbol: string;
  address: string;
  creator: string;
  reserveToken: string;
  reserveSymbol?: string;
  reserveDecimals?: number;
  tokenDecimals?: number;
  reserveBalance: bigint;
  currentSupply: bigint;
  maxSupply: bigint;
  mintRoyalty: number;
  burnRoyalty: number;
  createdAt: number;
  steps: readonly { rangeTo: bigint; price: bigint }[];
}) {
  const rSym = t.reserveSymbol ?? shortAddr(t.reserveToken);
  const reserveDecimals = t.reserveDecimals ?? 18;
  const tokenDecimals = t.tokenDecimals ?? 18;
  console.log([
    `\n🪙 Token: ${t.name} (${t.symbol})`,
    `📍 Address: ${t.address}`,
    `👤 Creator: ${shortAddr(t.creator)}`,
    `💰 Reserve: ${rSym} (${shortAddr(t.reserveToken)})`,
    `💎 Reserve Balance: ${fmt(t.reserveBalance, reserveDecimals)} ${rSym}`,
    `📊 Supply: ${fmt(t.currentSupply, tokenDecimals)} / ${fmt(t.maxSupply, tokenDecimals)}`,
    `💸 Mint Royalty: ${(t.mintRoyalty / 100).toFixed(2)}%`,
    `🔥 Burn Royalty: ${(t.burnRoyalty / 100).toFixed(2)}%`,
    `📅 Created: ${new Date(t.createdAt * 1000).toLocaleString()}`,
  ].join('\n'));

  if (t.steps.length > 0) {
    const first = t.steps[0];
    const last = t.steps[t.steps.length - 1];
    const firstPrice = Number(first.price) / 1e18;
    const lastPrice = Number(last.price) / 1e18;
    const times = firstPrice > 0 ? (lastPrice / firstPrice).toFixed(0) : '∞';
    console.log(
      `📈 Bonding Curve: ${t.steps.length} steps, ${fmt(first.price, reserveDecimals)} → ${fmt(last.price, reserveDecimals)} ${rSym} per token (+${times}x)`,
    );
  }
}
