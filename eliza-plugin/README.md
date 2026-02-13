# Mint Club V2 — ElizaOS Plugin

[ElizaOS](https://github.com/elizaOS/eliza) plugin for trading [Mint Club V2](https://mint.club) bonding curve tokens on Base.

> Part of the [mint.club-v2-ai](https://github.com/Steemhunt/mint.club-v2-ai) monorepo.
> PR: [elizaOS/eliza#6498](https://github.com/elizaOS/eliza/pull/6498)

## Actions

| Action | Description |
|--------|-------------|
| `TOKEN_INFO` | Get token details (supply, reserve, price, curve) |
| `TOKEN_PRICE` | Get current token price in reserve + USD |
| `SWAP` | Smart swap via bonding curves or Uniswap V3/V4 |
| `WALLET_BALANCE` | Check wallet balances |

## Setup

1. Install the CLI:
   ```bash
   bun install -g mint.club-cli
   ```

2. Set `PRIVATE_KEY` in your agent's environment.

3. Add to character config:
   ```json
   { "plugins": ["@elizaos/plugin-mintclub"] }
   ```

## Example Prompts

- *"Get info about SIGNET"*
- *"What's the price of HUNT?"*
- *"Swap 100 from ETH to HUNT"*
- *"Show my wallet balance"*
