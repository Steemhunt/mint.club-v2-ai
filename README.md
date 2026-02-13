<p align="center">
  <img src="https://mint.club/logo.png" alt="Mint Club" width="80" />
</p>

<h1 align="center">Mint Club V2 — AI Tools</h1>

<p align="center">
  Trade, create, and manage <a href="https://mint.club">bonding curve tokens</a> on Base — from the terminal, AI assistants, or autonomous agents.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/mint.club-cli"><img src="https://img.shields.io/npm/v/mint.club-cli.svg?style=flat-square&label=CLI" alt="CLI npm" /></a>
  <a href="https://www.npmjs.com/package/mintclub-mcp"><img src="https://img.shields.io/npm/v/mintclub-mcp.svg?style=flat-square&label=MCP" alt="MCP npm" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="MIT" /></a>
</p>

---

## What is Mint Club V2?

[Mint Club V2](https://mint.club) is a permissionless bonding curve protocol on **Base**. Launch tokens backed by any reserve asset (HUNT, ETH, USDC) with automated pricing — no liquidity pool required. The protocol handles minting, burning, and price discovery through smart contracts.

This monorepo provides AI-ready tooling for the protocol:

| Package | Description | Install |
|---------|-------------|---------|
| **[`cli/`](./cli/)** | `mc` command-line interface | `npm i -g mint.club-cli` |
| **[`mcp/`](./mcp/)** | MCP server for Claude, Cursor, etc. | `npx mintclub-mcp` |
| **[`agent-skills/`](./agent-skills/)** | Agent skill for OpenClaw | `clawhub install mintclub` |
| **[`eliza-plugin/`](./eliza-plugin/)** | ElizaOS plugin | [PR #6498](https://github.com/elizaOS/eliza/pull/6498) |

---

## Quick Start

### CLI

```bash
npm install -g mint.club-cli

mc wallet --generate              # Create a wallet
mc price SIGNET                   # Check token price
mc swap -i ETH -o HUNT -a 0.01   # Swap via Uniswap V3/V4
mc zap-buy SIGNET -i ETH -a 0.01 # Buy with any token
mc create -n "MyToken" -s MYT -r HUNT -x 1000000 --curve exponential
```

→ **[Full CLI docs](./cli/README.md)**

### MCP Server

Add to Claude Desktop / Cursor config:

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

10 tools: `token_info` · `token_price` · `wallet_balance` · `buy_token` · `sell_token` · `swap` · `zap_buy` · `zap_sell` · `send_token` · `create_token`

→ **[Full MCP docs](./mcp/README.md)**

### Agent Skill

```bash
clawhub install mintclub
```

→ **[Full agent skill docs](./agent-skills/README.md)**

---

## How It Works

```
User / AI Agent
      │
      ├── CLI ──────────── mc swap -i ETH -o HUNT -a 0.01
      ├── MCP Server ───── tool call → mc CLI → transaction
      ├── Agent Skill ──── reads SKILL.md → runs mc CLI
      └── ElizaOS Plugin ─ action handler → Bun.spawn(mc)
      │
      ▼
   mc CLI (mint.club-cli)
      │
      ├── Bonding Curve ── MCV2_Bond contract (buy/sell/create)
      ├── Zap ──────────── MCV2_ZapV2 (swap + bond in one tx)
      ├── Uniswap ──────── UniversalRouter V2 (V3 + V4 pools)
      └── Pricing ──────── 1inch Spot Price Aggregator (USD)
      │
      ▼
   Base L2 (Chain 8453)
```

**Smart swap routing:** `mc swap` auto-detects the optimal path — bonding curve buy/sell for Mint Club tokens, Uniswap V3/V4 for everything else, or zap (swap + bond) for cross-token purchases.

---

## Directory Listings

| Registry | Link |
|----------|------|
| npm (CLI) | [`mint.club-cli`](https://www.npmjs.com/package/mint.club-cli) |
| npm (MCP) | [`mintclub-mcp`](https://www.npmjs.com/package/mintclub-mcp) |
| MCP Registry | [`io.github.h1-hunt/mintclub`](https://registry.modelcontextprotocol.io) |
| mcp.so | [`mint-club`](https://mcp.so/server/mint-club/H-1) |
| ClawHub | [`mintclub`](https://clawhub.com/skills/mintclub) |
| ElizaOS | [Plugin PR #6498](https://github.com/elizaOS/eliza/pull/6498) |

## Links

| | |
|---|---|
| 🌐 **App** | [mint.club](https://mint.club) |
| 📖 **Docs** | [docs.mint.club](https://docs.mint.club) |
| 📦 **SDK** | [mint.club-v2-sdk](https://www.npmjs.com/package/mint.club-v2-sdk) |
| 🔗 **Contracts** | [Steemhunt/mint.club-v2-contract](https://github.com/Steemhunt/mint.club-v2-contract) |
| 💬 **Community** | [OnChat](https://onchat.sebayaki.com/mintclub) |
| 🐦 **Twitter** | [@MintClubPro](https://twitter.com/MintClubPro) |
| 🏗️ **Hunt Town** | [hunt.town](https://hunt.town) |

## License

MIT — built with 🏗️ by [Hunt Town](https://hunt.town)
