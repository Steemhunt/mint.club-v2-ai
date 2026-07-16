# Mint Club V2 AI

AI-facing tools for protocol-native [Mint Club V2](https://mint.club) operations on **Base** and **Robinhood Chain**.

## Components

| Package | Purpose |
|---|---|
| [`mint.club-cli`](./cli) | Direct CLI for Bond, ZapV1, token creation, transfers, prices, and balances |
| [`mintclub-mcp`](./mcp) | MCP tools backed by the CLI |
| [`@elizaos/plugin-mintclub`](./eliza-plugin) | ElizaOS actions backed by the CLI |
| [`agent-skills`](./agent-skills) | Agent instructions for using `mc` safely |

## Quick start

```bash
npm install -g mint.club-cli
mc wallet --generate

mc --chain base info SIGNET
mc --chain robinhood price 0xTOKEN
mc --chain robinhood zap-buy 0xWETH_RESERVE_TOKEN --amount 100
```

## Protocol operations

| Operation | Contract path |
|---|---|
| Buy with reserve ERC-20 | `MCV2_Bond.mint` |
| Sell for reserve ERC-20 | `MCV2_Bond.burn` |
| Buy WETH-reserve token with native ETH | `MCV2_ZapV1.mintWithEth` |
| Sell WETH-reserve token for native ETH | `MCV2_ZapV1.burnToEth` |
| Create token | `MCV2_Bond.createToken` |

This repository intentionally does not expose a general-purpose Uniswap/DEX swap command.

## MCP tools

The MCP server exposes nine tools:

`token_info` · `token_price` · `wallet_balance` · `buy_token` · `sell_token` · `zap_buy` · `zap_sell` · `send_token` · `create_token`

Every tool accepts an optional `chain` value: `base` (default) or `robinhood`.

## Architecture

```text
AI agent / user
      │
      ├── mc CLI
      ├── MCP server ────── argv ──┐
      ├── ElizaOS plugin ── argv ──┤
      └── Agent skill ─────────────┤
                                   ▼
                            mint.club-cli
                                   │
                  ┌────────────────┼────────────────┐
                  ▼                ▼                ▼
             MCV2_Bond        MCV2_ZapV1     DefiLlama API
            mint/burn/create   ETH wrap path    USD pricing
```

The CLI is the single source of truth for chain configuration and transaction behavior. MCP and Eliza invoke it with argument arrays rather than shell-interpolated commands.

## Supported chains

| Chain | Chain ID | Explorer |
|---|---:|---|
| Base | 8453 | [basescan.org](https://basescan.org) |
| Robinhood Chain | 4663 | [robinhoodchain.blockscout.com](https://robinhoodchain.blockscout.com) |

See the [CLI reference](./cli/README.md) for official contract addresses and command options.

## Development

Each package is independently installable and testable:

```bash
cd cli && npm install && npm run check && npm test && npm run build
cd ../mcp && npm install && npm run check && npm test && npm run build
cd ../eliza-plugin && npm install && npm run check && npm test && npm run build
```

## License

MIT
