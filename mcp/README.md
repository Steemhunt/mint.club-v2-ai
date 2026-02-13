# Mint Club V2 — MCP Server

[Model Context Protocol](https://modelcontextprotocol.io) server for Mint Club V2 on Base. Enables AI assistants (Claude, Cursor, etc.) to interact with bonding curve tokens through standardized tool calls.

## Setup

### Prerequisites

```bash
npm install -g mint.club-cli   # Install the CLI
mc wallet --set-private-key 0x... # Set up wallet
```

### Install & Build

```bash
cd mcp
npm install
npm run build
```

### Configure in Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mintclub": {
      "command": "node",
      "args": ["/path/to/mint.club-v2-ai/mcp/dist/index.js"],
      "env": {
        "PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `token_info` | Get token info (price, supply, reserve, curve) |
| `token_price` | Get token price in reserve + USD |
| `wallet_balance` | Show wallet address and balances |
| `buy_token` | Buy (mint) tokens via bonding curve |
| `sell_token` | Sell (burn) tokens via bonding curve |
| `swap` | Swap any token pair via Uniswap V3/V4 |
| `zap_buy` | Buy bonding curve tokens with any token |
| `zap_sell` | Sell bonding curve tokens for any token |
| `send_token` | Transfer ETH or ERC-20 tokens |
| `create_token` | Create a new bonding curve token |

## How It Works

The MCP server wraps the `mc` CLI, translating MCP tool calls into CLI commands. Read operations use viem directly for speed; write operations shell out to `mc` for full transaction handling (approvals, gas, confirmation).

## Example Interactions

> "What's the price of SIGNET?"
→ Calls `token_price` tool

> "Buy 100 SIGNET with ETH"
→ Calls `zap_buy` with token=SIGNET, inputToken=ETH

> "Swap 0.01 ETH for HUNT"
→ Calls `swap` with inputToken=ETH, outputToken=HUNT, amount=0.01

## Links

- [Mint Club V2 Docs](https://docs.mint.club)
- [MCP Specification](https://modelcontextprotocol.io)
- [CLI Package (npm)](https://www.npmjs.com/package/mint.club-cli)
