export type MintClubActionName =
  | 'TOKEN_INFO'
  | 'TOKEN_PRICE'
  | 'BUY_TOKEN'
  | 'SELL_TOKEN'
  | 'ZAP_BUY'
  | 'ZAP_SELL'
  | 'WALLET_BALANCE';

function chainArgs(text: string): string[] {
  return ['--chain', /\brobinhood(?:\s+chain)?\b/i.test(text) ? 'robinhood' : 'base'];
}

function tradeParts(text: string): { amount: string; token: string } {
  const match = text.match(
    /\b(?:buy|mint|sell|burn)\s+([0-9]+(?:\.[0-9]+)?)\s+(?:of\s+)?(0x[a-fA-F0-9]{40}|[a-zA-Z][a-zA-Z0-9]*)\b/i,
  );
  if (!match) {
    throw new Error('Specify an amount and token, for example: "buy 10 SIGNET"');
  }
  return { amount: match[1], token: match[2] };
}

function tokenFromText(text: string, action: 'info' | 'price'): string {
  const patterns =
    action === 'info'
      ? [
          /\b(?:info|details)\s+(?:about|for|of)?\s*(0x[a-fA-F0-9]{40}|[a-zA-Z][a-zA-Z0-9]*)\b/i,
          /\babout\s+(0x[a-fA-F0-9]{40}|[a-zA-Z][a-zA-Z0-9]*)\b/i,
        ]
      : [
          /\bprice\s+(?:of|for)?\s*(0x[a-fA-F0-9]{40}|[a-zA-Z][a-zA-Z0-9]*)\b/i,
          /\b(0x[a-fA-F0-9]{40}|[a-zA-Z][a-zA-Z0-9]*)\s+price\b/i,
        ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  throw new Error(`Specify a token for ${action}`);
}

export function buildActionArgs(
  action: MintClubActionName,
  text: string,
): string[] {
  const prefix = chainArgs(text);

  switch (action) {
    case 'TOKEN_INFO':
      return [...prefix, 'info', tokenFromText(text, 'info')];
    case 'TOKEN_PRICE':
      return [...prefix, 'price', tokenFromText(text, 'price')];
    case 'WALLET_BALANCE':
      return [...prefix, 'wallet'];
    case 'BUY_TOKEN': {
      const { token, amount } = tradeParts(text);
      return [...prefix, 'buy', token, '--amount', amount];
    }
    case 'SELL_TOKEN': {
      const { token, amount } = tradeParts(text);
      return [...prefix, 'sell', token, '--amount', amount];
    }
    case 'ZAP_BUY': {
      const { token, amount } = tradeParts(text);
      return [...prefix, 'zap-buy', token, '--amount', amount];
    }
    case 'ZAP_SELL': {
      const { token, amount } = tradeParts(text);
      return [...prefix, 'zap-sell', token, '--amount', amount];
    }
  }
}
