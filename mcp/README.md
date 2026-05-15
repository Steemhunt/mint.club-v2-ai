<p align="center">
  <img src="https://mint.club/logo.png" alt="Mint Club" width="80" />
</p>

<h1 align="center">Mint Club V2 — MCP Server</h1>

<p align="center">
  <a href="https://modelcontextprotocol.io">Model Context Protocol</a> server for <a href="https://mint.club">Mint Club V2</a> on Base — enables AI assistants to trade bonding curve tokens through standardized tool calls.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/mintclub-mcp"><img src="https://img.shields.io/npm/v/mintclub-mcp.svg?style=flat-square&label=npm" alt="npm" /></a>
  <a href="https://www.npmjs.com/package/mintclub-mcp"><img src="https://img.shields.io/npm/dm/mintclub-mcp.svg?style=flat-square&label=downloads" alt="downloads" /></a>
  <a href="https://packagephobia.com/result?p=mintclub-mcp"><img src="https://packagephobia.com/badge?p=mintclub-mcp" alt="install size" /></a>
  <a href="https://github.com/Steemhunt/mint.club-v2-ai"><img src="https://img.shields.io/github/stars/Steemhunt/mint.club-v2-ai?style=flat-square&logo=github" alt="GitHub" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="MIT" /></a>
</p>

<p align="center">
  Part of the <a href="https://github.com/Steemhunt/mint.club-v2-ai">mint.club-v2-ai</a> monorepo.
</p>

---

## Quick Start

```json
{
  "mcpServers": {
    "mintclub": {
      "command": "npx",
      "args": ["-y", "mintclub-mcp"],
      "env": { "PRIVATE_KEY": "0x..." }
    }
  }
}
```

Add this to your Claude Desktop (`claude_desktop_config.json`) or Cursor MCP config.

### Prerequisites

The MCP server wraps the [`mc` CLI](../cli/), so it must be installed:

```bash
npm install -g mint.club-cli
mc wallet --set-private-key 0x...
```

## Tools

| Tool | Description |
|------|-------------|
| `token_info` | Token details — price, supply, reserve, bonding curve |
| `token_price` | Current price in reserve token + USD |
| `wallet_balance` | Wallet address and balances |
| `buy_token` | Buy (mint) via bonding curve |
| `sell_token` | Sell (burn) via bonding curve |
| `swap` | Smart swap — auto-routes via bonding curve or Uniswap V3/V4 |
| `zap_buy` | Buy bonding curve tokens with any token |
| `zap_sell` | Sell bonding curve tokens for any token |
| `send_token` | Transfer ETH or ERC-20 tokens |
| `create_token` | Create a new bonding curve token |

## Example Prompts

- *"What's the price of SIGNET?"* → `token_price`
- *"Buy 100 SIGNET with ETH"* → `zap_buy`
- *"Swap 0.01 ETH for HUNT"* → `swap`
- *"Create a token called TEST with exponential curve"* → `create_token`

## Development

```bash
cd mcp
npm install
npm run build
node dist/index.js  # Run locally
```

## Registry Listings

- [MCP Registry](https://registry.modelcontextprotocol.io) — `io.github.h1-hunt/mintclub`
- [mcp.so](https://mcp.so/server/mint-club/H-1)
