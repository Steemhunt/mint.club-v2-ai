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
  '@mint.club/v2-cli/chain-registry.json',
) as ChainRegistryData;

export const SUPPORTED_CHAINS = Object.freeze(
  chainRegistry.chains.map(({ key }) => key),
);

type SupportedChain = string;
type TextSpan = readonly [start: number, end: number];

function matchSpan(match: RegExpMatchArray): TextSpan {
  const start = match.index;
  if (start === undefined) throw new Error('Parser match is missing its source position');
  return [start, start + match[0].length];
}

function assertFullyParsed(text: string, spans: readonly TextSpan[]): void {
  const ordered = [...spans].sort(([left], [right]) => left - right);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index][0] < ordered[index - 1][1]) {
      throw new Error('Confirmed write contains overlapping transaction clauses');
    }
  }

  const remaining = text.split('');
  for (const [start, end] of spans) {
    for (let index = start; index < end; index += 1) remaining[index] = ' ';
  }
  const unmatched = remaining
    .join('')
    .replace(/[.,!?;]+/g, ' ')
    .trim();
  if (unmatched) {
    throw new Error(
      `Confirmed write contains unsupported or unmatched text: "${unmatched}"`,
    );
  }
}

const WRITE_ACTIONS = new Set<MintClubActionName>([
  'BUY_TOKEN',
  'SELL_TOKEN',
  'ZAP_BUY',
  'ZAP_SELL',
  'SEND_TOKEN',
  'CREATE_TOKEN',
]);

const UNSAFE_CONFIRMATION_CHARS =
  /[^\S ]|[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
const TRANSACTION_NAME_WORDS =
  /(?:^|[^a-z])(?:buy|mint|sell|burn|send|transfer|create|launch|approve|revoke|execute|confirm)(?=$|[^a-z])/i;

function confirmationEnvelopeSpan(text: string): TextSpan {
  const confirmation = text.match(/^\s*confirm\s*:\s+/i);
  if (!confirmation) {
    throw new Error(
      'Write requests must start with "Confirm:" and repeat the full transaction details',
    );
  }
  if (UNSAFE_CONFIRMATION_CHARS.test(text)) {
    throw new Error(
      'Confirmed writes must use printable text with ASCII spaces; control, formatting, and bidirectional characters are not allowed',
    );
  }
  if (text.includes('?')) {
    throw new Error(
      'Confirmed writes must be affirmative statements, not questions',
    );
  }
  if (
    /\b(?:do\s+not|don['’]?t|not|never|cancel|abort|stop|without|except|no\s+longer)\b/i.test(
      text,
    )
  ) {
    throw new Error(
      'Confirmed write must be a single affirmative transaction without negation or cancellation',
    );
  }
  return matchSpan(confirmation);
}

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

function chainSelection(text: string, strictWrite = false): {
  args: ['--chain', SupportedChain];
  spans: TextSpan[];
  mentionCount: number;
} {
  const negated = new Set<SupportedChain>();
  const negation = new RegExp(
    `\\b(?:not|without|except)\\s+(?:on\\s+)?(?:the\\s+)?(${CHAIN_ALIAS_PATTERN})(?:\\s+chain)?\\b`,
    'gi',
  );
  const positiveText = text.replace(negation, (match, alias: string) => {
    negated.add(resolveChainAlias(alias));
    return ' '.repeat(match.length);
  });
  if (positiveText.length !== text.length) {
    throw new Error('Chain parser span alignment failed');
  }

  const mentioned = new Set<SupportedChain>();
  const spans: TextSpan[] = [];
  const contextSuffix = strictWrite
    ? '(?:chain|mainnet)'
    : '(?:chain|mainnet|wallet|balance|holdings)';
  const positive = new RegExp(
    `(?:\\bon\\s+(?:the\\s+)?(${CHAIN_ALIAS_PATTERN})(?:\\s+chain)?\\b|\\b(${CHAIN_ALIAS_PATTERN})\\s+${contextSuffix}\\b)`,
    'gi',
  );
  for (const match of positiveText.matchAll(positive)) {
    mentioned.add(resolveChainAlias(match[1] ?? match[2]));
    spans.push(matchSpan(match));
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
  return { args: ['--chain', selected], spans, mentionCount: spans.length };
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

function tradeLimitPattern(action: 'buy' | 'sell'): RegExp {
  const limit =
    action === 'buy'
      ? 'max(?:imum)?\\s+cost'
      : 'min(?:imum)?\\s+refund';
  return new RegExp(
    `\\bwith\\s+(?:a\\s+)?${limit}\\s+${AMOUNT_PATTERN}\\s+reserve\\s+(?:tokens?|units?)\\b`,
    'i',
  );
}

function tradeLimitParts(
  text: string,
  action: 'buy' | 'sell',
): { args: string[]; span: TextSpan } {
  const match = text.match(tradeLimitPattern(action));
  if (!match) {
    throw new Error(
      action === 'buy'
        ? 'Confirmed buy must include "with maximum cost AMOUNT reserve units"'
        : 'Confirmed sell must include "with minimum refund AMOUNT reserve units"',
    );
  }
  return {
    args: [action === 'buy' ? '--max-cost' : '--min-refund', match[1]],
    span: matchSpan(match),
  };
}

function tradeParts(
  text: string,
  action: 'buy' | 'sell',
): { amount: string; token: string; span: TextSpan } {
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
  const trailingText = text
    .slice((match.index ?? 0) + match[0].length)
    .replace(tradeLimitPattern(action), ' ');
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
  return { amount: match[1], token: match[2], span: matchSpan(match) };
}

function zapBuyParts(text: string): {
  token: string;
  inputAmount: string;
  inputToken: string;
  span: TextSpan;
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
    span: matchSpan(match),
  };
}

function zapSellParts(text: string): {
  token: string;
  amount: string;
  outputToken: string;
  span: TextSpan;
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
    span: matchSpan(match),
  };
}

function slippageParts(text: string): { args: string[]; spans: TextSpan[] } {
  const match = text.match(
    /\b(?:with|at)?\s*([0-9]+(?:\.[0-9]+)?)\s*%\s+slippage\b/i,
  );
  if (!match) {
    throw new Error(
      'Confirmed routed write must include an explicit slippage percentage',
    );
  }
  return {
    args: ['--slippage', match[1]],
    spans: [matchSpan(match)],
  };
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
  span: TextSpan;
} {
  const match = text.match(
    new RegExp(
      `\\b(?:send|transfer)\\s+${AMOUNT_PATTERN}\\s+${ASSET_PATTERN}\\s+to\\s+(0x[a-fA-F0-9]{40})\\b`,
      'i',
    ),
  );
  if (!match) {
    throw new Error(
      'Specify amount, token or native asset, and recipient, for example: "send 10 USDC to 0x..."',
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
    span: matchSpan(match),
  };
}

function royaltyParts(text: string): {
  args: string[];
  spans: TextSpan[];
} {
  const mint = text.match(
    /\bwith\s+([0-9]+)\s*(?:bp|bps|basis\s+points?)\s+mint\s+royalt(?:y|ies)\b/i,
  );
  const burn = text.match(
    /\band\s+([0-9]+)\s*(?:bp|bps|basis\s+points?)\s+burn\s+royalt(?:y|ies)\b/i,
  );
  if (!mint || !burn) {
    throw new Error(
      'Confirmed token creation must include explicit mint and burn royalties in basis points',
    );
  }
  for (const value of [mint[1], burn[1]]) {
    if (Number(value) > 10_000) {
      throw new Error('Royalty basis points must be between 0 and 10000');
    }
  }
  return {
    args: [
      '--mint-royalty',
      mint[1],
      '--burn-royalty',
      burn[1],
    ],
    spans: [matchSpan(mint), matchSpan(burn)],
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
  span: TextSpan;
} {
  const match = text.match(
    /\b(?:create|launch)\s+(?:a\s+)?token\s+"([a-zA-Z0-9][a-zA-Z0-9 ._&()+-]{0,63})"\s+\(([a-zA-Z][a-zA-Z0-9_-]*)\)\s+backed\s+by\s+(0x[a-fA-F0-9]{40}|[a-zA-Z][a-zA-Z0-9_-]*)\s+with\s+max(?:imum)?\s+supply\s+([0-9]+(?:\.[0-9]+)?)\s+using\s+(?:a\s+)?(linear|exponential|logarithmic|flat)\s+curve\s+from\s+([0-9]+(?:\.[0-9]+)?)\s+to\s+([0-9]+(?:\.[0-9]+)?)\b/i,
  );
  if (!match) {
    throw new Error(
      'Use a printable ASCII name: create token "Name" (SYMBOL) backed by RESERVE with max supply N using a CURVE curve from START to END',
    );
  }
  if (
    match[1] !== match[1].trim() ||
    / {2,}/.test(match[1]) ||
    TRANSACTION_NAME_WORDS.test(match[1])
  ) {
    throw new Error(
      'Token name must be printable ASCII without transaction instructions',
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
    span: matchSpan(match),
  };
}

function confirmedWriteArgs(
  text: string,
  argv: string[],
  spans: readonly TextSpan[],
  chainMentionCount: number,
): string[] {
  const confirmationSpan = confirmationEnvelopeSpan(text);
  if (chainMentionCount !== 1) {
    throw new Error(
      `Confirmed write must specify exactly one chain: ${SUPPORTED_CHAINS.join(', ')}`,
    );
  }
  assertFullyParsed(text, [confirmationSpan, ...spans]);
  return [...argv, '--yes'];
}

export function buildActionArgs(
  action: MintClubActionName,
  text: string,
): string[] {
  const isWrite = WRITE_ACTIONS.has(action);
  if (isWrite) confirmationEnvelopeSpan(text);
  const chain = chainSelection(text, isWrite);
  const prefix = chain.args;

  switch (action) {
    case 'TOKEN_INFO':
      return [...prefix, 'info', tokenFromText(text, 'info')];
    case 'TOKEN_PRICE':
      return [...prefix, 'price', tokenFromText(text, 'price')];
    case 'WALLET_BALANCE':
      return [...prefix, 'wallet'];
    case 'BUY_TOKEN': {
      const parts = tradeParts(text, 'buy');
      const limit = tradeLimitParts(text, 'buy');
      return confirmedWriteArgs(
        text,
        [
          ...prefix,
          'buy',
          parts.token,
          '--amount',
          parts.amount,
          ...limit.args,
        ],
        [...chain.spans, parts.span, limit.span],
        chain.mentionCount,
      );
    }
    case 'SELL_TOKEN': {
      const parts = tradeParts(text, 'sell');
      const limit = tradeLimitParts(text, 'sell');
      return confirmedWriteArgs(
        text,
        [
          ...prefix,
          'sell',
          parts.token,
          '--amount',
          parts.amount,
          ...limit.args,
        ],
        [...chain.spans, parts.span, limit.span],
        chain.mentionCount,
      );
    }
    case 'ZAP_BUY': {
      const parts = zapBuyParts(text);
      const slippage = slippageParts(text);
      return confirmedWriteArgs(
        text,
        [
          ...prefix,
          'zap-buy',
          parts.token,
          '--input-token',
          parts.inputToken,
          '--input-amount',
          parts.inputAmount,
          ...slippage.args,
        ],
        [...chain.spans, parts.span, ...slippage.spans],
        chain.mentionCount,
      );
    }
    case 'ZAP_SELL': {
      const parts = zapSellParts(text);
      const slippage = slippageParts(text);
      return confirmedWriteArgs(
        text,
        [
          ...prefix,
          'zap-sell',
          parts.token,
          '--amount',
          parts.amount,
          '--output-token',
          parts.outputToken,
          ...slippage.args,
        ],
        [...chain.spans, parts.span, ...slippage.spans],
        chain.mentionCount,
      );
    }
    case 'SEND_TOKEN': {
      const parts = sendParts(text, prefix[1]);
      return confirmedWriteArgs(
        text,
        [
          ...prefix,
          'send',
          parts.recipient,
          '--amount',
          parts.amount,
          ...(parts.token ? ['--token', parts.token] : []),
        ],
        [...chain.spans, parts.span],
        chain.mentionCount,
      );
    }
    case 'CREATE_TOKEN': {
      const parts = createParts(text);
      const royalties = royaltyParts(text);
      return confirmedWriteArgs(
        text,
        [
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
          ...royalties.args,
        ],
        [...chain.spans, parts.span, ...royalties.spans],
        chain.mentionCount,
      );
    }
  }
}
