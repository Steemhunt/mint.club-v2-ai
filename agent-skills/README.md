# Mint Club V2 — Agent Skill

AI agent skill for trading [Mint Club V2](https://mint.club) bonding curve tokens on Base.

> Part of the [mint.club-v2-ai](https://github.com/Steemhunt/mint.club-v2-ai) monorepo.

## Install

```bash
clawhub install mintclub
```

Or manually copy [`SKILL.md`](./SKILL.md) into your agent's skills directory.

## Prerequisites

```bash
npm install -g mint.club-cli    # Install the CLI
mc wallet --generate            # Create a wallet (or --set-private-key)
```

Fund the wallet with ETH on Base for gas fees.

## What Agents Can Do

- **Query** — token info, prices, wallet balances
- **Trade** — buy/sell via bonding curves, zap with any token
- **Swap** — any token pair via Uniswap V3/V4
- **Create** — new bonding curve tokens with preset curves
- **Transfer** — ETH and ERC-20 tokens

The agent reads `SKILL.md` to learn available `mc` CLI commands and executes them via shell.

## Links

- [ClawHub](https://clawhub.com/skills/mintclub)
- [CLI docs](../cli/README.md)
- [Full command reference](./SKILL.md)
