import { createRequire } from 'module';

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

interface ChainRegistryData {
  chains: readonly {
    key: string;
    nativeSymbol: string;
    aliases: readonly string[];
  }[];
}

const require = createRequire(import.meta.url);
const chainRegistry = require(
  'mint.club-cli/chain-registry.json',
) as ChainRegistryData;

export const SUPPORTED_CHAINS = Object.freeze(
  chainRegistry.chains.map(({ key }) => key),
);

type SupportedChain = string;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeChainAlias(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, '');
}

function aliasPattern(alias: string): string {
  return alias
    .split(/[\s_-]+/)
    .map(escapeRegExp)
    .join('[\\s_-]*');
}

const chainByAlias = new Map<string, SupportedChain>();
const nativeSymbolByChain = new Map<SupportedChain, string>();
const nativeSymbols = new Set<string>();
const legacyNativeChainBySymbol = new Map<string, SupportedChain>([
  ['MATIC', 'polygon'],
]);
const aliases: string[] = [];

for (const {
  key,
  nativeSymbol,
  aliases: configuredAliases,
} of chainRegistry.chains) {
  const normalizedNativeSymbol = nativeSymbol.toUpperCase();
  nativeSymbolByChain.set(key, normalizedNativeSymbol);
  nativeSymbols.add(normalizedNativeSymbol);

  for (const alias of new Set([key, ...configuredAliases])) {
    const normalized = normalizeChainAlias(alias);
    const existing = chainByAlias.get(normalized);
    if (existing && existing !== key) {
      throw new Error(
        `Duplicate chain alias "${alias}" for ${existing} and ${key}`,
      );
    }
    chainByAlias.set(normalized, key);
    aliases.push(alias);
  }
}

for (const symbol of legacyNativeChainBySymbol.keys()) {
  nativeSymbols.add(symbol);
}

const CHAIN_ALIAS_PATTERN = [...new Set(aliases)]
  .sort((left, right) => right.length - left.length)
  .map(aliasPattern)
  .join('|');

function resolveChainAlias(alias: string): SupportedChain {
  const chain = chainByAlias.get(normalizeChainAlias(alias));
  if (!chain) throw new Error(`Unknown chain alias: ${alias}`);
  return chain;
}

function chainArgs(text: string): ['--chain', SupportedChain] {
  const negated = new Set<SupportedChain>();
  const negation = new RegExp(
    `\\b(?:not|without|except)\\s+(?:on\\s+)?(?:the\\s+)?(${CHAIN_ALIAS_PATTERN})(?:\\s+chain)?\\b`,
    'gi',
  );
  const positiveText = text.replace(negation, (_match, alias: string) => {
    negated.add(resolveChainAlias(alias));
    return ' ';
  });

  const mentioned = new Set<SupportedChain>();
  const positive = new RegExp(
    `(?:\\bon\\s+(?:the\\s+)?(${CHAIN_ALIAS_PATTERN})(?:\\s+chain)?\\b|\\b(${CHAIN_ALIAS_PATTERN})\\s+(?:chain|mainnet|wallet|balance|holdings)\\b)`,
    'gi',
  );
  for (const match of positiveText.matchAll(positive)) {
    mentioned.add(resolveChainAlias(match[1] ?? match[2]));
  }

  const hasConflict = [...mentioned].some((chain) => negated.has(chain));
  if (
    mentioned.size > 1 ||
    hasConflict ||
    (mentioned.size === 0 && negated.has('base'))
  ) {
    throw new Error(
      `Specify exactly one chain: ${SUPPORTED_CHAINS.join(', ')}`,
    );
  }

  const selected = mentioned.values().next().value ?? 'base';
  return ['--chain', selected];
}

const TOKEN_PATTERN =
  '(0x[a-fA-F0-9]{40}|[a-zA-Z][a-zA-Z0-9_-]*)';
const ASSET_PATTERN =
  '(native(?:\\s+currency)?|0x[a-fA-F0-9]{40}|[a-zA-Z][a-zA-Z0-9_-]*)';
const AMOUNT_PATTERN = '([0-9]+(?:\\.[0-9]+)?)';

function normalizeAsset(value: string): string {
  return /^native(?:\s+currency)?$/i.test(value) ? 'NATIVE' : value;
}

function rejectUnsupportedIntent(
  text: string,
  pattern: RegExp,
  description: string,
): void {
  if (pattern.test(text)) {
    throw new Error(`${description} is not supported by this text parser`);
  }
}

function tradeParts(
  text: string,
  action: 'buy' | 'sell',
): { amount: string; token: string } {
  rejectUnsupportedIntent(
    text,
    action === 'buy'
      ? /\bmax(?:imum)?\s+cost\b/i
      : /\bmin(?:imum)?\s+refund\b/i,
    action === 'buy' ? 'Maximum cost' : 'Minimum refund',
  );
  const verbs = action === 'buy' ? '(?:buy|mint)' : '(?:sell|burn)';
  const match = text.match(
    new RegExp(
      `\\b${verbs}\\s+${AMOUNT_PATTERN}\\s+(?:of\\s+)?${TOKEN_PATTERN}\\b`,
      'i',
    ),
  );
  if (!match) {
    throw new Error('Specify an amount and token, for example: "buy 10 SIGNET"');
  }
  const trailingText = text.slice((match.index ?? 0) + match[0].length);
  const routedIntent =
    action === 'buy'
      ? /\b(?:with|using|from)\b/i
      : /\b(?:for|to|into)\b/i;
  if (routedIntent.test(trailingText)) {
    throw new Error(
      action === 'buy'
        ? 'Use the exact-input form: Buy TOKEN with AMOUNT INPUT_TOKEN'
        : 'Use the routed-output form: Sell AMOUNT TOKEN for OUTPUT_TOKEN',
    );
  }
  return { amount: match[1], token: match[2] };
}

function zapBuyParts(text: string): {
  token: string;
  inputAmount: string;
  inputToken: string;
} {
  rejectUnsupportedIntent(
    text,
    /\bmin(?:imum)?\s+tokens?\b/i,
    'Minimum token output',
  );
  const match = text.match(
    new RegExp(
      `\\b(?:zap\\s+)?(?:buy|mint)\\s+(?:token\\s+)?${TOKEN_PATTERN}\\s+(?:with|using|from)\\s+${AMOUNT_PATTERN}\\s+(?:of\\s+)?${ASSET_PATTERN}\\b`,
      'i',
    ),
  );
  if (!match) {
    throw new Error(
      'Use: Buy TOKEN with AMOUNT INPUT_TOKEN, for example: "Buy SIGNET with 10 USDC"',
    );
  }
  return {
    token: match[1],
    inputAmount: match[2],
    inputToken: normalizeAsset(match[3]),
  };
}

function zapSellParts(text: string): {
  token: string;
  amount: string;
  outputToken: string;
} {
  rejectUnsupportedIntent(
    text,
    /\bmin(?:imum)?\s+output\b/i,
    'Minimum routed output',
  );
  const match = text.match(
    new RegExp(
      `\\b(?:zap\\s+)?(?:sell|burn)\\s+${AMOUNT_PATTERN}\\s+(?:of\\s+)?${TOKEN_PATTERN}\\s+(?:for|to|into)\\s+${ASSET_PATTERN}\\b`,
      'i',
    ),
  );
  if (!match) {
    throw new Error(
      'Use: Sell AMOUNT TOKEN for OUTPUT_TOKEN, for example: "Sell 5 SIGNET for USDC"',
    );
  }
  return {
    amount: match[1],
    token: match[2],
    outputToken: normalizeAsset(match[3]),
  };
}

function slippageArgs(text: string): string[] {
  const match = text.match(
    /\b(?:with|at)?\s*([0-9]+(?:\.[0-9]+)?)\s*%\s+slippage\b/i,
  );
  return match ? ['--slippage', match[1]] : [];
}

function tokenFromText(text: string, action: 'info' | 'price'): string {
  const patterns =
    action === 'info'
      ? [
          /\b(?:info|details)\s+(?:about|for|of)?\s*(0x[a-fA-F0-9]{40}|[a-zA-Z][a-zA-Z0-9_-]*)\b/i,
          /\babout\s+(0x[a-fA-F0-9]{40}|[a-zA-Z][a-zA-Z0-9_-]*)\b/i,
        ]
      : [
          /\bprice\s+(?:of|for)?\s*(0x[a-fA-F0-9]{40}|[a-zA-Z][a-zA-Z0-9_-]*)\b/i,
          /\bworth\s+(?:of\s+)?(0x[a-fA-F0-9]{40}|[a-zA-Z][a-zA-Z0-9_-]*)\b/i,
          /\bwhat\s+is\s+(0x[a-fA-F0-9]{40}|[a-zA-Z][a-zA-Z0-9_-]*)\s+worth\b/i,
          /\b(0x[a-fA-F0-9]{40}|[a-zA-Z][a-zA-Z0-9_-]*)\s+(?:price|worth)\b/i,
        ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  throw new Error(`Specify a token for ${action}`);
}

function sendParts(text: string, chain: SupportedChain): {
  amount: string;
  token?: string;
  recipient: string;
} {
  const match = text.match(
    new RegExp(
      `\\b(?:send|transfer)\\s+${AMOUNT_PATTERN}\\s+(?:${ASSET_PATTERN}\\s+)?to\\s+(0x[a-fA-F0-9]{40})\\b`,
      'i',
    ),
  );
  if (!match) {
    throw new Error(
      'Specify amount, optional token, and recipient, for example: "send 10 USDC to 0x..."',
    );
  }
  const token = match[2];
  const normalizedToken = token
    ? normalizeAsset(token).toUpperCase()
    : undefined;
  const nativeSymbol = nativeSymbolByChain.get(chain);
  if (!nativeSymbol) throw new Error(`Missing native symbol for ${chain}`);
  const isSelectedNativeSymbol =
    normalizedToken === nativeSymbol ||
    legacyNativeChainBySymbol.get(normalizedToken ?? '') === chain;

  if (
    normalizedToken &&
    normalizedToken !== 'NATIVE' &&
    nativeSymbols.has(normalizedToken) &&
    !isSelectedNativeSymbol
  ) {
    throw new Error(
      `${normalizedToken} is not the native currency on ${chain}; use ${nativeSymbol} or NATIVE`,
    );
  }

  return {
    amount: match[1],
    token:
      normalizedToken === undefined ||
      normalizedToken === 'NATIVE' ||
      isSelectedNativeSymbol
        ? undefined
        : token,
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
  rejectUnsupportedIntent(
    text,
    /\b(?:(?:mint|burn)\s+)?royalt(?:y|ies)\b/i,
    'Explicit royalty configuration',
  );
  const match = text.match(
    /\b(?:create|launch)\s+(?:a\s+)?token\s+"([^"]{1,64})"\s+\(([a-zA-Z][a-zA-Z0-9_-]*)\)\s+backed\s+by\s+(0x[a-fA-F0-9]{40}|[a-zA-Z][a-zA-Z0-9_-]*)\s+with\s+max(?:imum)?\s+supply\s+([0-9]+(?:\.[0-9]+)?)\s+using\s+(?:a\s+)?(linear|exponential|logarithmic|flat)\s+curve\s+from\s+([0-9]+(?:\.[0-9]+)?)\s+to\s+([0-9]+(?:\.[0-9]+)?)\b/i,
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
      const { token, amount } = tradeParts(text, 'buy');
      return [...prefix, 'buy', token, '--amount', amount];
    }
    case 'SELL_TOKEN': {
      const { token, amount } = tradeParts(text, 'sell');
      return [...prefix, 'sell', token, '--amount', amount];
    }
    case 'ZAP_BUY': {
      const { token, inputAmount, inputToken } = zapBuyParts(text);
      return [
        ...prefix,
        'zap-buy',
        token,
        '--input-token',
        inputToken,
        '--input-amount',
        inputAmount,
        ...slippageArgs(text),
      ];
    }
    case 'ZAP_SELL': {
      const { token, amount, outputToken } = zapSellParts(text);
      return [
        ...prefix,
        'zap-sell',
        token,
        '--amount',
        amount,
        '--output-token',
        outputToken,
        ...slippageArgs(text),
      ];
    }
    case 'SEND_TOKEN': {
      const { amount, token, recipient } = sendParts(text, prefix[1]);
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
