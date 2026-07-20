# Mint Club V2 — ElizaOS Plugin

ElizaOS actions for protocol-native [Mint Club V2](https://mint.club) operations and bounded local Uniswap ZapV2 routing across ten mainnets and two testnets.

[npm package](https://www.npmjs.com/package/@mint.club/v2-eliza-plugin) · [repository](https://github.com/Steemhunt/mint.club-v2-ai) · [CLI reference](../cli) · [MCP server](../mcp)

The plugin invokes [`@mint.club/v2-cli`](../cli) with argv arrays and does not interpolate user input into shell commands. Chain keys and aliases come from the CLI package's published `chain-registry.json`.

## Actions

The plugin exposes nine protocol-specific actions:

| Action | Description |
|---|---|
| `TOKEN_INFO` | Token supply, reserve, price, and curve |
| `TOKEN_PRICE` | Token price in reserve and USD |
| `BUY_TOKEN` | Mint with the configured reserve ERC-20 via `MCV2_Bond` |
| `SELL_TOKEN` | Burn for the configured reserve ERC-20 via `MCV2_Bond` |
| `ZAP_BUY` | Exact routed input asset → `MCV2_ZapV2.zapMint` |
| `ZAP_SELL` | `MCV2_ZapV2.zapBurn` → routed output asset |
| `WALLET_BALANCE` | Show chain-local wallet balances |
| `SEND_TOKEN` | Send native currency or an ERC-20 token |
| `CREATE_TOKEN` | Create an ERC-20 bonding curve token |

There is no general-purpose DEX swap action. Zap routing checks only direct and one-intermediary homogeneous V2/V3/V4 paths by RPC.

## Setup

```bash
npm install @mint.club/v2-eliza-plugin
```

Requires Node.js 22.13 or later and an ElizaOS project compatible with `@elizaos/core ^1.7.2`. The plugin installs a compatible `@mint.club/v2-cli` 2.x runtime dependency automatically.

Add the plugin to an ElizaOS character configuration:

```json
{
  "plugins": ["@mint.club/v2-eliza-plugin"]
}
```

See the official [ElizaOS plugin management guide](https://docs.elizaos.ai/cli-reference/plugins) for project and character configuration details.

Read-only actions work without a wallet. Write actions and wallet balances require `PRIVATE_KEY` through the ElizaOS secret/environment configuration, or a key in `~/.mintclub/.env`. To generate a dedicated local wallet, install the CLI and run `mc wallet --generate` in a trusted terminal.

> Never store a key in a character file, commit it, or paste it into an agent conversation. Use a dedicated wallet with limited funds.

A write action runs only when the **original user message** is one affirmative `Confirm:` statement. The parser rejects question-form confirmations, non-ASCII whitespace, control/format/bidirectional characters, negation, cancellation, multiple write clauses, and any unmatched text. The model and plugin must never add this prefix on the user’s behalf; a bare follow-up such as “yes” is insufficient.

Every confirmation must name exactly one chain and bind every effective financial parameter:

- direct buys: `with maximum cost AMOUNT reserve units`
- direct sells: `with minimum refund AMOUNT reserve units`
- routed buys/sells: an explicit slippage percentage
- sends: the native or ERC-20 asset, amount, recipient, and chain
- token creation: a printable ASCII name without transaction instructions, plus mint and burn royalties in basis points

## Example prompts

- “Get info about SIGNET.”
- “What is the price of TOKEN on Robinhood?”
- “Confirm: Buy 25 SIGNET on Base with maximum cost 30 reserve units.”
- “Confirm: Sell 5 SIGNET on Base with minimum refund 4 reserve units.”
- “Confirm: Buy TOKEN with 10 USDT on Arbitrum with 0.5% slippage.”
- “Confirm: Sell 5 TOKEN for USDC on Unichain with 1% slippage.”
- “Show my wallet balance on Polygon.”
- “Confirm: Send 10 USDG to `0x1111111111111111111111111111111111111111` on Robinhood.”
- “Confirm: Create token \"My Token\" (MYT) backed by USDG with max supply 1000000 using a linear curve from 0.01 to 1 on Robinhood with 100 bps mint royalty and 100 bps burn royalty.”

The Zap parser deliberately rejects the ambiguous target-amount form “Buy 10 TOKEN with ETH.” Use “Buy TOKEN with 0.1 ETH” so the exact routed input amount is explicit. The plugin does not accept an implicit Zap slippage default in a confirmed write.

The target Mint Club token may be ERC-20 or ERC-1155; ERC-1155 amounts must be whole numbers. Routed input/output and `SEND_TOKEN` assets must be native currency or ERC-20 tokens.

The text parser fails closed on constraints it cannot map without ambiguity. Direct trade limits use numeric reserve-token units, and token-creation royalties use integer basis points. Use the CLI or MCP server when you need explicit routed minimum-output values instead of percentage slippage.

Supported canonical chain keys:

`ethereum` · `optimism` · `arbitrum` · `avalanche` · `base` · `polygon` · `bsc` · `zora` · `unichain` · `robinhood` · `sepolia` · `base-sepolia`

Natural-language aliases such as “Ethereum mainnet,” “Ethereum Sepolia,” “Base Sepolia,” “Arbitrum One,” “BNB Chain,” and “Robinhood Chain” are loaded from the central registry. Base is the default only for reads; every write confirmation must name one chain explicitly. Contradictory or repeated chain instructions are rejected rather than guessed.

ZapV2 is deployed on every supported chain listed above. Blast is unsupported by this integration.

## Development

From the repository root:

```bash
npm ci
npm --prefix eliza-plugin run check
npm --prefix eliza-plugin test
npm --prefix eliza-plugin run build
```

## License

MIT
