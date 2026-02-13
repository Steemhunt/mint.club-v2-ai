import { formatUnits, parseUnits } from 'viem';

export function formatAmount(amount: bigint, decimals: number = 18): string {
  return formatUnits(amount, decimals);
}

export function parseAmount(amount: string, decimals: number = 18): bigint {
  return parseUnits(amount, decimals);
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatTxHash(hash: string): string {
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

export function formatTokenInfo(tokenInfo: {
  name: string;
  symbol: string;
  address: string;
  creator: string;
  reserveToken: string;
  reserveBalance: bigint;
  currentSupply: bigint;
  maxSupply: bigint;
  mintRoyalty: number;
  burnRoyalty: number;
  createdAt: number;
  steps: readonly { rangeTo: bigint; price: bigint }[];
}): string {
  const lines = [
    `🪙 Token: ${tokenInfo.name} (${tokenInfo.symbol})`,
    `📍 Address: ${tokenInfo.address}`,
    `👤 Creator: ${formatAddress(tokenInfo.creator)}`,
    `💰 Reserve Token: ${formatAddress(tokenInfo.reserveToken)}`,
    `💎 Reserve Balance: ${formatAmount(tokenInfo.reserveBalance)} tokens`,
    `📊 Supply: ${formatAmount(tokenInfo.currentSupply)} / ${formatAmount(tokenInfo.maxSupply)}`,
    `💸 Mint Royalty: ${(tokenInfo.mintRoyalty / 100).toFixed(2)}%`,
    `🔥 Burn Royalty: ${(tokenInfo.burnRoyalty / 100).toFixed(2)}%`,
    `📅 Created: ${new Date(tokenInfo.createdAt * 1000).toLocaleString()}`,
  ];

  if (tokenInfo.steps.length > 0) {
    lines.push('📈 Bonding Curve Steps:');
    tokenInfo.steps.forEach((step, i) => {
      lines.push(`   Step ${i + 1}: Up to ${formatAmount(step.rangeTo)} at ${formatAmount(step.price)} per token`);
    });
  }

  return lines.join('\n');
}

export function displayError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function parseStepsInput(stepsStr: string): { stepRanges: bigint[]; stepPrices: bigint[] } {
  const steps = stepsStr.split(',').map(s => s.trim());
  const stepRanges: bigint[] = [];
  const stepPrices: bigint[] = [];
  
  for (const step of steps) {
    const [range, price] = step.split(':').map(s => s.trim());
    if (!range || !price) {
      throw new Error(`Invalid step format: ${step}. Expected format: "range:price"`);
    }
    
    stepRanges.push(parseAmount(range));
    stepPrices.push(parseAmount(price));
  }
  
  return { stepRanges, stepPrices };
}