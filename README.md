# Mint Club V2 — AI Tools

AI-powered tools for [Mint Club V2](https://mint.club) bonding curve tokens on Base.

## Structure

```
├── cli/            # Command-line interface (npm: mint.club-cli)
├── agent-skills/   # AI agent skill (OpenClaw, etc.)
└── mcp/            # Model Context Protocol server (Claude, Cursor, etc.)
```

## Packages

### [`cli/`](./cli/) — Command Line Interface

The `mc` CLI for trading, creating, and managing bonding curve tokens.

```bash
npm install -g mint.club-cli

mc info SIGNET                    # Token info
mc swap -i ETH -o HUNT -a 0.01   # Swap via Uniswap V3/V4
mc zap-buy SIGNET -i ETH -a 0.01 # Buy with any token
mc create -n "MyToken" -s MYT ... # Create bonding curve
```

**[→ CLI Documentation](./cli/README.md)**

### [`agent-skills/`](./agent-skills/) — Agent Skills

Skill definition for AI agents to interact with Mint Club V2. Drop `SKILL.md` into your agent's skills directory.

**[→ Agent Skills Documentation](./agent-skills/README.md)**

### [`mcp/`](./mcp/) — MCP Server

Model Context Protocol server that exposes Mint Club operations as tools for AI assistants like Claude Desktop and Cursor.

```json
{
  "mcpServers": {
    "mintclub": {
      "command": "node",
      "args": ["./mcp/dist/index.js"]
    }
  }
}
```

**[→ MCP Documentation](./mcp/README.md)**

## What is Mint Club V2?

Mint Club V2 is a bonding curve token protocol on Base. Tokens are created with programmable price curves backed by reserve tokens (HUNT, ETH, USDC, etc.). The protocol handles minting, burning, and price discovery automatically through smart contracts.

- **Protocol:** [mint.club](https://mint.club)
- **Docs:** [docs.mint.club](https://docs.mint.club)
- **Community:** [OnChat](https://onchat.sebayaki.com/mintclub)

## License

MIT
