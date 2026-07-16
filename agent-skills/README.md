# Mint Club V2 — Agent Skill

Agent instructions for protocol-native [Mint Club V2](https://mint.club) Bond operations and bounded local Uniswap ZapV2 routing across 11 mainnets plus Sepolia.

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

Fund the wallet with the selected chain's native currency for gas and, when requested, transaction value.

## Capabilities

- **Query** token info, prices, and wallet balances
- **Mint/burn** with a token's reserve ERC-20 through `MCV2_Bond`
- **Routed mint/burn** with exact input/output protection through `MCV2_ZapV2`
- **Create** bonding curve tokens
- **Transfer** native currency and ERC-20 tokens

The skill deliberately excludes general-purpose swaps and unbounded route search. It instructs agents to describe routes as best among the direct/one-intermediary V2/V3/V4 candidates that were actually quoted.

ZapV2 addresses are currently unconfigured and must never be guessed. Zap writes fail closed until official deployment addresses are added.

## Supported chains

`ethereum` · `optimism` · `arbitrum` · `avalanche` · `base` · `polygon` · `bsc` · `blast` · `zora` · `unichain` · `robinhood` · `sepolia`

Base is the default. Keys, aliases, and capability flags come from the CLI's central `chain-registry.json`.

## Links

- [ClawHub](https://clawhub.com/skills/mintclub)
- [CLI documentation](../cli/README.md)
- [Full agent instructions](./SKILL.md)
