# Mint Club V2 MCP Server

An MCP server exposing Mint Club V2 Bond operations and bounded local Uniswap ZapV2 routing across ten mainnets and two testnets.

The server delegates to [`@mint.club/v2-cli`](../cli), so the CLI remains the single source of truth for contracts, token resolution, route discovery, pricing, and transactions. Chain keys are loaded from the CLI's published `chain-registry.json` rather than duplicated in the MCP package.

## Install

```bash
npm install -g @mint.club/v2-mcp
```

`@mint.club/v2-mcp` installs the compatible `@mint.club/v2-cli` 2.x runtime dependency automatically. Configure `PRIVATE_KEY` in the MCP client as shown below. To use the shared `~/.mintclub` wallet file instead, install `@mint.club/v2-cli` as a top-level CLI and run `mc wallet --set-private-key 0xYOUR_PRIVATE_KEY` in a trusted local terminal. Never paste a private key into an MCP conversation.

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
| `zap_buy` | Exact routed input asset → `MCV2_ZapV2.zapMint` |
| `zap_sell` | `MCV2_ZapV2.zapBurn` → routed output asset |
| `send_token` | Send native currency or ERC-20 |
| `create_token` | Create a bonding curve token |

`create_token` requires `curve`, `initialPrice`, and `finalPrice` in addition to its name, symbol, reserve, and maximum supply.

Every tool accepts an optional canonical `chain` property. Base is the default. Supported values are:

`ethereum` · `optimism` · `arbitrum` · `avalanche` · `base` · `polygon` · `bsc` · `zora` · `unichain` · `robinhood` · `sepolia` · `base-sepolia`

Blast is unsupported by this integration.

## ZapV2 inputs

`zap_buy` requires:

```json
{
  "chain": "arbitrum",
  "token": "0xMINT_CLUB_TOKEN",
  "inputToken": "USDT",
  "inputAmount": "10",
  "slippage": "1"
}
```

Optional `minTokens` is denominated in the Mint Club token. `inputAmount` is exact.

`zap_sell` requires:

```json
{
  "chain": "unichain",
  "token": "0xMINT_CLUB_TOKEN",
  "amount": "100",
  "outputToken": "USDC",
  "slippage": "1"
}
```

Optional `minOutput` is denominated in the output asset. `amount` is the exact Mint Club token burn amount.

The CLI enumerates direct and one-intermediary homogeneous V2/V3/V4 candidates by RPC, selects the greatest exact-input output among those candidates, and encodes it with the Universal Router SDK. It does not call an external routing API and does not claim global route optimality.

ZapV2 is deployed on every supported chain listed above. Deployment addresses are maintained by `@mint.club/v2-cli`; see the [CLI contract table](../cli/README.md#mint-club-contract-configuration).

## Example requests

- “Get token info for SIGNET on Base.” → `token_info`
- “Mint 100 TOKEN on Robinhood with its USDG reserve.” → `buy_token`
- “Buy TOKEN with exactly 10 USDT on Arbitrum.” → `zap_buy`
- “Sell 50 TOKEN for USDC on Unichain.” → `zap_sell`
- “Create token My Token (MYT), backed by USDG on Robinhood, with maximum supply 1,000,000 and a linear curve from 0.01 to 1 USDG.” → `create_token`

## Safe CLI execution

Tool arguments are passed to `mc` with `execFileSync` argv arrays. User values are not interpolated into a shell command.

Set `MINTCLUB_CLI` to override the CLI executable path.

## Development

From the repository root:

```bash
npm ci
npm --prefix mcp run check
npm --prefix mcp test
npm --prefix mcp run build
```

## License

MIT
