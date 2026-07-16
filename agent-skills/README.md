# Mint Club V2 — Agent Skill

Agent instructions for protocol-native [Mint Club V2](https://mint.club) operations on Base and Robinhood Chain.

## Install

```bash
clawhub install mintclub
```

Or copy [`SKILL.md`](./SKILL.md) into your agent's skill directory.

## Prerequisites

```bash
npm install -g mint.club-cli
mc wallet --generate
```

Fund the wallet with native ETH on the selected chain for gas and transaction value.

## Capabilities

- **Query** token info, prices, and wallet balances
- **Mint/burn** with a token's reserve ERC-20 through `MCV2_Bond`
- **Native ETH Zap** for WETH-reserve tokens through `MCV2_ZapV1`
- **Create** bonding curve tokens
- **Transfer** native ETH and ERC-20 tokens

The skill deliberately excludes general-purpose DEX swaps.

## Supported chains

- Base (`--chain base`, default)
- Robinhood Chain (`--chain robinhood`)

## Links

- [ClawHub](https://clawhub.com/skills/mintclub)
- [CLI documentation](../cli/README.md)
- [Full agent instructions](./SKILL.md)
