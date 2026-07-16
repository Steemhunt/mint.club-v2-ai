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
| `SEND_TOKEN` | Send native ETH or an ERC-20 token |
| `CREATE_TOKEN` | Create an ERC-20 bonding curve token |

There is no general-purpose DEX swap action.

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
- “Buy 10 TOKEN with ETH on Robinhood.”
- “Sell 5 TOKEN for ETH on Robinhood.”
- “Show my wallet balance on Robinhood.”
- “Send 10 USDG to `0x1111111111111111111111111111111111111111` on Robinhood.”
- “Create token \"My Token\" (MYT) backed by USDG with max supply 1000000 using a linear curve from 0.01 to 1 on Robinhood.”

Use “on Base” or “on Robinhood” for explicit chain selection. Base is the default; contradictory chain instructions are rejected rather than guessed.

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
