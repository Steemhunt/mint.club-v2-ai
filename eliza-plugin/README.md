# Mint Club V2 — ElizaOS Plugin

ElizaOS actions for protocol-native [Mint Club V2](https://mint.club) operations and bounded local Uniswap ZapV2 routing across 11 mainnets plus Sepolia.

The plugin invokes [`mint.club-cli`](../cli) with argv arrays and does not interpolate user input into shell commands. Chain keys and aliases come from the CLI package's published `chain-registry.json`.

## Actions

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
npm install @elizaos/plugin-mintclub
```

The plugin installs the compatible `mint.club-cli` 2.x runtime dependency automatically. Configure `PRIVATE_KEY` through the ElizaOS secret/environment configuration. To use the shared `~/.mintclub` wallet file instead, install `mint.club-cli` as a top-level CLI and run `mc wallet --set-private-key`.

Add the plugin to an ElizaOS character configuration:

```json
{
  "plugins": ["@elizaos/plugin-mintclub"]
}
```

Read-only actions work without a private key. Write actions and wallet balances require `PRIVATE_KEY` or the CLI wallet file.

## Example prompts

- “Get info about SIGNET.”
- “What is the price of TOKEN on Robinhood?”
- “Buy 25 SIGNET.”
- “Sell 5 SIGNET.”
- “Buy TOKEN with 10 USDT on Arbitrum with 0.5% slippage.”
- “Sell 5 TOKEN for USDC on Unichain.”
- “Show my wallet balance on Polygon.”
- “Send 10 USDG to `0x1111111111111111111111111111111111111111` on Robinhood.”
- “Create token \"My Token\" (MYT) backed by USDG with max supply 1000000 using a linear curve from 0.01 to 1 on Robinhood.”

The Zap parser deliberately rejects the old ambiguous target-amount form “Buy 10 TOKEN with ETH.” Use “Buy TOKEN with 0.1 ETH” so the exact routed input amount is explicit.

Supported canonical chain keys:

`ethereum` · `optimism` · `arbitrum` · `avalanche` · `base` · `polygon` · `bsc` · `blast` · `zora` · `unichain` · `robinhood` · `sepolia`

Natural-language aliases such as “Ethereum mainnet,” “Arbitrum One,” “BNB Chain,” and “Robinhood Chain” are loaded from the central registry. Base is the default. Contradictory or multiple positive chain instructions are rejected rather than guessed.

**ZapV2 addresses are intentionally unconfigured in this revision.** Zap actions fail before approvals or transaction construction until an official address is added to the CLI registry.

## Development

From the repository root:

```bash
npm ci
npm run check --workspace @elizaos/plugin-mintclub
npm test --workspace @elizaos/plugin-mintclub
npm run build --workspace @elizaos/plugin-mintclub
```

## License

MIT
