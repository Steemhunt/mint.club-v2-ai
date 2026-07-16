# Mint Club V2 MCP Server

An MCP server exposing Mint Club V2 Bond operations and bounded local Uniswap ZapV2 routing across ten mainnets and two testnets.

[npm package](https://www.npmjs.com/package/@mint.club/v2-mcp) · [repository](https://github.com/Steemhunt/mint.club-v2-ai) · [CLI reference](../cli) · [ElizaOS plugin](../eliza-plugin)

The server delegates to [`@mint.club/v2-cli`](../cli), so the CLI remains the single source of truth for contracts, token resolution, route discovery, pricing, and transactions. Chain keys are loaded from the CLI's published `chain-registry.json` rather than duplicated in the MCP package.

## Configure

Requires Node.js 18 or later. Most MCP clients can launch the package directly with `npx`:

```json
{
  "mcpServers": {
    "mintclub": {
      "command": "npx",
      "args": ["-y", "@mint.club/v2-mcp@2"]
    }
  }
}
```

For a global installation, run `npm install -g @mint.club/v2-mcp` and use `"command": "mintclub-mcp"` instead. The MCP package installs a compatible `@mint.club/v2-cli` 2.x runtime dependency automatically.

Read-only tools work without a wallet. Write tools and `wallet_balance` require `PRIVATE_KEY` in the server process, or a key in `~/.mintclub/.env`. Supply it through the MCP client's secret/environment facility. To generate a dedicated local wallet, install the CLI and run `mc wallet --generate` in a trusted terminal.

> Never store a key in a committed MCP configuration or paste it into a model conversation. Use a dedicated wallet with limited funds.

## Tools

The server exposes nine protocol-specific tools:

| Tool | Description |
|---|---|
| `token_info` | Token supply, reserve, curve, price, and USD values |
| `token_price` | Price in reserve token and USD |
| `wallet_balance` | Chain-local configured-wallet balances |
| `buy_token` | `MCV2_Bond.mint` with reserve ERC-20 |
| `sell_token` | `MCV2_Bond.burn` for reserve ERC-20 |
| `zap_buy` | Exact routed input asset → `MCV2_ZapV2.zapMint` |
| `zap_sell` | `MCV2_ZapV2.zapBurn` → routed output asset |
| `send_token` | Send native currency or an ERC-20 token |
| `create_token` | Create an ERC-20 bonding curve token |

`create_token` requires `curve`, `initialPrice`, and `finalPrice` in addition to its name, symbol, reserve, and maximum supply. It uses the CLI defaults of 100 basis points (1%) for both mint and burn royalties; use the CLI directly when different royalties are required.

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

The Mint Club token passed to `zap_buy` or `zap_sell` may be ERC-20 or ERC-1155; ERC-1155 amounts must be whole numbers. Routed input and output assets must be native currency or ERC-20 tokens.

The CLI enumerates direct and one-intermediary homogeneous V2/V3/V4 candidates where configured, selects the greatest exact-input output among those candidates, and encodes it with the Universal Router SDK. It does not call an external routing API and does not claim global route optimality.

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
