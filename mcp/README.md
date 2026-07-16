# Mint Club V2 MCP Server

An MCP server exposing protocol-native Mint Club V2 operations on **Base** and **Robinhood Chain**.

The server delegates to [`mint.club-cli`](../cli), so the CLI remains the single source of truth for contracts, token resolution, pricing, and transactions.

## Install

```bash
npm install -g mint.club-cli mintclub-mcp
mc wallet --set-private-key 0xYOUR_PRIVATE_KEY
```

## Configure

```json
{
  "mcpServers": {
    "mintclub": {
      "command": "mintclub-mcp",
      "env": {
        "PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

Write tools and `wallet_balance` require a configured key. Pass `PRIVATE_KEY`, or let the CLI load `~/.mintclub/.env`.

## Tools

| Tool | Description |
|---|---|
| `token_info` | Token supply, reserve, curve, price, and USD values |
| `token_price` | Price in reserve token and USD |
| `wallet_balance` | Chain-local configured-wallet balances |
| `buy_token` | `MCV2_Bond.mint` with reserve ERC-20 |
| `sell_token` | `MCV2_Bond.burn` for reserve ERC-20 |
| `zap_buy` | `MCV2_ZapV1.mintWithEth` for WETH-reserve tokens |
| `zap_sell` | `MCV2_ZapV1.burnToEth` for WETH-reserve tokens |
| `send_token` | Send native ETH or ERC-20 |
| `create_token` | Create a bonding curve token |

`create_token` requires `curve`, `initialPrice`, and `finalPrice` in addition to its name, symbol, reserve, and maximum supply.

Every tool accepts an optional `chain` property:

```json
{ "chain": "base" }
```

Supported values are `base` (default) and `robinhood`.

Zap tools mint or burn an **exact Mint Club token amount**. They use native ETH and only work for WETH-reserve tokens; they do not perform a DEX swap.

## Example requests

- “Get token info for SIGNET on Base.” → `token_info`
- “Mint 100 TOKEN on Robinhood with its USDG reserve.” → `buy_token`
- “Buy 100 TOKEN with ETH on Robinhood.” → `zap_buy`
- “Sell 50 TOKEN for ETH on Robinhood.” → `zap_sell`
- “Create MYT backed by USDG on Robinhood.” → `create_token`

## Safe CLI execution

Tool arguments are passed to `mc` with `execFileSync` argv arrays. User values are not interpolated into a shell command.

Set `MINTCLUB_CLI` to override the CLI executable path.

## Development

```bash
npm install
npm run check
npm test
npm run build
```

## License

MIT
