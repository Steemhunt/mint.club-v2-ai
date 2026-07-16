# Mint Club V2 — ElizaOS Plugin

ElizaOS actions for protocol-native [Mint Club V2](https://mint.club) operations on **Base** and **Robinhood Chain**.

The plugin invokes [`mint.club-cli`](../cli) with argv arrays and does not interpolate user input into shell commands.

## Actions

| Action | Description |
|---|---|
| `TOKEN_INFO` | Token supply, reserve, price, and curve |
| `TOKEN_PRICE` | Token price in reserve and USD |
| `BUY_TOKEN` | Mint with the configured reserve ERC-20 via `MCV2_Bond` |
| `SELL_TOKEN` | Burn for the configured reserve ERC-20 via `MCV2_Bond` |
| `ZAP_BUY` | Mint a WETH-reserve token with native ETH via `MCV2_ZapV1` |
| `ZAP_SELL` | Burn a WETH-reserve token for native ETH via `MCV2_ZapV1` |
| `WALLET_BALANCE` | Show chain-local wallet balances |

There is no general-purpose DEX swap action.

## Setup

```bash
npm install -g mint.club-cli
mc wallet --set-private-key 0xYOUR_PRIVATE_KEY
```

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
- “Buy 10 TOKEN with ETH on Robinhood.”
- “Sell 5 TOKEN for ETH on Robinhood.”
- “Show my Robinhood wallet balance.”

Mentioning “Robinhood” selects Robinhood Chain; otherwise Base is used.

## Development

```bash
npm install
npm run check
npm test
npm run build
```

## License

MIT
