export type MintClubActionName =
  | 'TOKEN_INFO'
  | 'TOKEN_PRICE'
  | 'BUY_TOKEN'
  | 'SELL_TOKEN'
  | 'ZAP_BUY'
  | 'ZAP_SELL'
  | 'WALLET_BALANCE'
  | 'SEND_TOKEN'
  | 'CREATE_TOKEN';

function chainArgs(text: string): string[] {
  const negatedRobinhood =
    /\b(?:not|without|except)\s+(?:on\s+)?(?:the\s+)?robinhood(?:\s+chain)?\b/i.test(
      text,
    );
  const negatedBase =
    /\b(?:not|without|except)\s+(?:on\s+)?(?:the\s+)?base(?:\s+chain)?\b/i.test(
      text,
    );
  const positiveText = text.replace(
    /\b(?:not|without|except)\s+(?:on\s+)?(?:the\s+)?(?:base(?:\s+chain)?|robinhood(?:\s+chain)?)\b/gi,
    '',
  );
  const mentionsRobinhood =
    /\b(?:on\s+(?:the\s+)?robinhood(?:\s+chain)?|robinhood\s+chain|robinhood\s+(?:wallet|balance|holdings))\b/i.test(
      positiveText,
    );
  const mentionsBase =
    /\b(?:on\s+(?:the\s+)?base(?:\s+chain)?|base\s+chain|base\s+(?:wallet|balance|holdings))\b/i.test(
      positiveText,
    );

  if (
    (mentionsRobinhood && mentionsBase) ||
    (mentionsRobinhood && negatedRobinhood) ||
    (mentionsBase && negatedBase) ||
    (negatedRobinhood && negatedBase)
  ) {
    throw new Error('Specify exactly one chain: Base or Robinhood');
  }
  if (mentionsRobinhood || (negatedBase && !mentionsBase)) {
    return ['--chain', 'robinhood'];
  }
  return ['--chain', 'base'];
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
          /\bworth\s+(?:of\s+)?(0x[a-fA-F0-9]{40}|[a-zA-Z][a-zA-Z0-9]*)\b/i,
          /\bwhat\s+is\s+(0x[a-fA-F0-9]{40}|[a-zA-Z][a-zA-Z0-9]*)\s+worth\b/i,
          /\b(0x[a-fA-F0-9]{40}|[a-zA-Z][a-zA-Z0-9]*)\s+(?:price|worth)\b/i,
        ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  throw new Error(`Specify a token for ${action}`);
}

function sendParts(text: string): {
  amount: string;
  token?: string;
  recipient: string;
} {
  const match = text.match(
    /\b(?:send|transfer)\s+([0-9]+(?:\.[0-9]+)?)\s+(?:(0x[a-fA-F0-9]{40}|[a-zA-Z][a-zA-Z0-9]*)\s+)?to\s+(0x[a-fA-F0-9]{40})\b/i,
  );
  if (!match) {
    throw new Error(
      'Specify amount, optional token, and recipient, for example: "send 10 USDG to 0x..."',
    );
  }
  const token = match[2];
  return {
    amount: match[1],
    token:
      token && !['eth', 'native'].includes(token.toLowerCase())
        ? token
        : undefined,
    recipient: match[3],
  };
}

function createParts(text: string): {
  name: string;
  symbol: string;
  reserve: string;
  maxSupply: string;
  curve: string;
  initialPrice: string;
  finalPrice: string;
} {
  const match = text.match(
    /\b(?:create|launch)\s+(?:a\s+)?token\s+"([^"]{1,64})"\s+\(([a-zA-Z][a-zA-Z0-9]*)\)\s+backed\s+by\s+(0x[a-fA-F0-9]{40}|[a-zA-Z][a-zA-Z0-9]*)\s+with\s+max(?:imum)?\s+supply\s+([0-9]+(?:\.[0-9]+)?)\s+using\s+(?:a\s+)?(linear|exponential|logarithmic|flat)\s+curve\s+from\s+([0-9]+(?:\.[0-9]+)?)\s+to\s+([0-9]+(?:\.[0-9]+)?)\b/i,
  );
  if (!match) {
    throw new Error(
      'Use: create token "Name" (SYMBOL) backed by RESERVE with max supply N using a CURVE curve from START to END',
    );
  }
  return {
    name: match[1],
    symbol: match[2],
    reserve: match[3],
    maxSupply: match[4],
    curve: match[5].toLowerCase(),
    initialPrice: match[6],
    finalPrice: match[7],
  };
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
    case 'SEND_TOKEN': {
      const { amount, token, recipient } = sendParts(text);
      return [
        ...prefix,
        'send',
        recipient,
        '--amount',
        amount,
        ...(token ? ['--token', token] : []),
      ];
    }
    case 'CREATE_TOKEN': {
      const parts = createParts(text);
      return [
        ...prefix,
        'create',
        '--name',
        parts.name,
        '--symbol',
        parts.symbol,
        '--reserve',
        parts.reserve,
        '--max-supply',
        parts.maxSupply,
        '--curve',
        parts.curve,
        '--initial-price',
        parts.initialPrice,
        '--final-price',
        parts.finalPrice,
        '--yes',
      ];
    }
  }
}
